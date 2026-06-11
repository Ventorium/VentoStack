/**
 * 从 https://models.dev/ 解析供应商模型列表
 *
 * models.dev 是静态网站，数据嵌在 HTML 表格中：
 * <tr data-search="Model Name provider/model-id Lab ...">
 *   <td>Model Name</td>  <td>Lab</td>  <td>Providers</td>
 *   <td>Context</td>  <td>Output</td>
 *   <td>Input modalities</td>  <td>Reasoning</td>
 *   <td>Tool Call</td>  ...
 * </tr>
 */

export interface FetchedModel {
  modelId: string;
  displayName: string;
  contextLength: number;
  maxOutputTokens: number;
  supportsText: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsFunctionCalling: boolean;
  supportsThinking: boolean;
  pricingInput: number | null;
  pricingOutput: number | null;
}

/**
 * 从 models.dev 获取指定供应商的模型列表
 * 通过解析 HTML 表格获取模型数据
 * @param providerSlug 供应商 slug（如 "openai", "anthropic", "google"）
 */
export async function fetchModelsFromDev(providerSlug: string): Promise<FetchedModel[]> {
  try {
    const response = await fetch("https://models.dev/models", {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`models.dev returned ${response.status}`);
    }

    const html = await response.text();
    return parseModelsHtml(html, providerSlug);
  } catch (err) {
    throw new Error(
      `Failed to fetch models from models.dev for "${providerSlug}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 解析 models.dev HTML 表格，提取指定供应商的模型
 *
 * 表格结构:
 * <tr data-search="DisplayName provider/model-id Lab ...">
 *   <td data-sort="DisplayName"> ... provider/model-id ... </td>
 *   <td data-sort="Lab">Lab</td>
 *   <td data-sort="N">N</td> (provider count)
 *   <td data-sort="128000">128,000</td> (context)
 *   <td data-sort="8192">8,192</td> (output)
 *   <td data-sort="text image text"><modality icons></td> (input modalities)
 *   <td data-sort="Yes|No">Yes|No</td> (reasoning)
 *   <td data-sort="Yes|No">Yes|No</td> (tool call)
 *   <td data-sort="Yes|No|-">Yes|No|-</td> (structured)
 *   <td data-sort="Yes|No">Yes|No</td> (temperature)
 *   <td data-sort="Open|Closed">Open|Closed</td> (weights)
 *   <td data-sort="$X.XX">$X.XX / $X.XX</td> (price)
 * </tr>
 */
function parseModelsHtml(html: string, providerSlug: string): FetchedModel[] {
  const results: FetchedModel[] = [];

  // Match all <tr> rows with data-search attribute
  const rowRegex = /<tr\s+data-search="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const dataSearch = rowMatch[1];
    const rowHtml = rowMatch[2];

    // Check if this row belongs to the requested provider
    // data-search format: "ModelName provider/model-id Lab ..."
    // We need to find "providerSlug/modelId" in the data-search string
    const modelIdMatch = dataSearch.match(
      new RegExp(`(?:^|\\s)(${providerSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[\\w\\.\\-]+)`, "i"),
    );
    if (!modelIdMatch) continue;

    const fullModelId = modelIdMatch[1]; // e.g., "openai/gpt-4o"
    const modelId = fullModelId.split("/").slice(1).join("/"); // "gpt-4o"

    // Extract display name (first part of data-search before the provider/model-id)
    const displayName = dataSearch.split(fullModelId)[0]?.trim() || modelId;

    // Parse <td> cells
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      // Strip HTML tags and trim
      cells.push(tdMatch[1].replace(/<[^>]*>/g, "").trim());
    }

    // Parse data-sort attributes for precise values
    const sortValues: string[] = [];
    const sortRegex = /data-sort="([^"]*)"/gi;
    let sortMatch: RegExpExecArray | null;
    while ((sortMatch = sortRegex.exec(rowHtml)) !== null) {
      sortValues.push(sortMatch[1]);
    }

    // Extract fields from sort values
    // sort[0] = Model display name
    // sort[1] = Lab
    // sort[2] = Provider count (number)
    // sort[3] = Context length
    // sort[4] = Max output tokens
    // sort[5] = Input modalities (text/image/video/audio mixed in string)
    // sort[6] = Reasoning (Yes/No)
    // sort[7] = Tool Call (Yes/No)
    // sort[8] = Structured (Yes/No/-)
    // sort[9] = Temperature (Yes/No)
    // sort[10] = Weights (Open/Closed)
    // sort[11] = Price ($X.XX / $X.XX)
    // sort[12] = Release date
    // sort[13] = Updated date

    const contextLength = parseNumber(sortValues[3]) ?? 128000;
    const maxOutput = parseNumber(sortValues[4]) ?? 4096;

    // Parse input modalities from the data-sort value
    const modalityStr = (sortValues[5] ?? "").toLowerCase();
    const supportsText = modalityStr.includes("text");
    const supportsImage = modalityStr.includes("image");
    const supportsVideo = modalityStr.includes("video");
    const supportsAudio = modalityStr.includes("audio");

    // Parse capabilities
    const supportsThinking = (sortValues[6] ?? "").toLowerCase() === "yes";
    const supportsFunctionCalling = (sortValues[7] ?? "").toLowerCase() === "yes";

    // Parse price
    const priceStr = sortValues[11] ?? "";
    let pricingInput: number | null = null;
    let pricingOutput: number | null = null;
    const priceMatch = priceStr.match(/\$?([\d.]+)\s*\/\s*\$?([\d.]+)/);
    if (priceMatch) {
      pricingInput = parseFloat(priceMatch[1]) || null;
      pricingOutput = parseFloat(priceMatch[2]) || null;
    }

    results.push({
      modelId,
      displayName,
      contextLength,
      maxOutputTokens: maxOutput,
      supportsText,
      supportsImage,
      supportsVideo,
      supportsAudio,
      supportsFunctionCalling,
      supportsThinking,
      pricingInput,
      pricingOutput,
    });
  }

  return results;
}

function parseNumber(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
}
