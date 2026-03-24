const Anthropic = require("@anthropic-ai/sdk");
const XLSX = require("xlsx");

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a document analyst for the Utah Arts Festival. You will receive one or more documents from a media partner (rate cards, proposals, contracts, presentations, spreadsheets).

Extract the following as structured JSON:
- Partner organization name
- Contact person name
- Contact email
- Contact phone (if available)
- List of deliverables the partner is offering, each with:
  - description: what the deliverable is (e.g. "80 spots on KUER running 4/27-6/20/2026")
  - dates: date range if specified (e.g. "4/27/2026 - 6/20/2026")
  - value: dollar value as a number (0 if in-kind/free)
- Any notes about payment terms, special conditions, or important details

Return ONLY valid JSON matching this exact schema:
{
  "partner": {
    "name": "string",
    "contact": "string or null",
    "email": "string or null",
    "phone": "string or null"
  },
  "deliverables": [
    {
      "description": "string",
      "dates": "string or null",
      "value": 0
    }
  ],
  "notes": "string or null"
}

If a value is unclear, make your best estimate. If a field is missing, use null.
Combine information from all documents if multiple are provided.
For items marked as "in-kind," "$0.00," or "complimentary," set value to 0 but include the estimated media value in the description if mentioned.`;

async function extractFromDocuments(files) {
  const client = new Anthropic();
  const contentBlocks = [];

  for (const file of files) {
    const ext = file.originalname.split(".").pop().toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      // Convert spreadsheet to CSV text
      const workbook = XLSX.read(file.buffer);
      const csvTexts = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
      });
      contentBlocks.push({
        type: "text",
        text: `Spreadsheet file "${file.originalname}":\n\n${csvTexts.join("\n\n")}`,
      });
    } else if (ext === "pdf") {
      contentBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: file.buffer.toString("base64"),
        },
        title: file.originalname,
      });
    } else if (ext === "docx") {
      contentBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          data: file.buffer.toString("base64"),
        },
        title: file.originalname,
      });
    } else {
      // Try as text
      contentBlocks.push({
        type: "text",
        text: `File "${file.originalname}":\n\n${file.buffer.toString("utf-8")}`,
      });
    }
  }

  contentBlocks.push({
    type: "text",
    text: "Extract the partner information and deliverables from the above documents. Return ONLY valid JSON.",
  });

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const text = response.content[0].text;

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  try {
    return JSON.parse(jsonMatch[1].trim());
  } catch (e) {
    throw new Error(`AI returned invalid JSON. Try uploading again or use a different file format. Raw: ${text.slice(0, 200)}`);
  }
}

module.exports = { extractFromDocuments };
