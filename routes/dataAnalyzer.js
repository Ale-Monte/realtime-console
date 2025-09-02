// routes/dataRoute.js
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import express from "express";
import os from 'os';

dotenv.config();

const router = express.Router();

// Ephemeral directory: IMAGE_SAVE_PATH (if set) → OS TEMP (Azure maps to D:\local\Temp)
const EPHEMERAL_DIR = process.env.IMAGE_SAVE_PATH || process.env.TEMP || os.tmpdir(); // ← added

// --- Helper to normalize query input ---
function normalizeInput(input) {
  if (!input) return "";
  if (typeof input === "string") return input.trim();
  if (typeof input === "object" && !Array.isArray(input)) {
    return input.user_query?.trim() || input.name?.trim() || "";
  }
  if (Array.isArray(input)) {
    for (const el of input) {
      const val = normalizeInput(el);
      if (val) return val;
    }
    return "";
  }
  return String(input).trim();
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// OpenAI client
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// Shared session
const SESSION = axios.create({
  headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
});

const BASE_URL = 'https://api.openai.com/v1';

export async function createResponse(inputText) {
  /** Generate a response and return message text + container_id. */
  const result = { message: '', container_id: null };

  const response = await client.responses.create({
    model: 'gpt-4.1-nano',
    input: inputText,
    tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
    instructions:
      'You are a professional data analyst. Answer concisely and accurately. Focus on the numbers. Never give the links in your text response.',
  });

  const messageParts = [];
  for (const item of response.output || []) {
    if (item.type === 'code_interpreter_call') {
      result.container_id = item.container_id;
    } else if (item.type === 'message' && item.content) {
      const first = item.content[0];
      if (first.type === 'output_text') {
        messageParts.push(first.text);
      }
    }
  }

  result.message = messageParts.join('');
  return result;
}

export async function retrieveContainerFiles(containerId) {
  /** List files for a given container, keeping only one per sanitized filename. */
  const url = `${BASE_URL}/containers/${containerId}/files`;
  const resp = await SESSION.get(url);
  const data = resp.data;

  const files = [];
  const seenNames = new Set();

  for (const f of data.data || []) {
    const rawPath = f.path || '';
    const cleaned = (rawPath.split('/').pop() || '')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .trim()
      .toLowerCase();
    const filename = cleaned || 'file';

    if (seenNames.has(filename)) continue;
    seenNames.add(filename);

    files.push({ id: f.id || '', name: filename });
  }

  return { container_id: containerId, files };
}

export async function downloadContainerFile(containerFiles) {
  /** Download all container files to ./downloads. */
  const { container_id: containerId, files } = containerFiles;
  const downloadDir = path.join(EPHEMERAL_DIR, 'downloads'); // ← changed to ephemeral storage
  fs.mkdirSync(downloadDir, { recursive: true });

  const savedPaths = [];
  for (const f of files) {
    const { id: fileId, name: fileName } = f;
    const url = `${BASE_URL}/containers/${containerId}/files/${fileId}/content`;

    const resp = await SESSION.get(url, { responseType: 'arraybuffer' });
    if (resp.status !== 200) {
      throw new Error(
        `Failed to download file ${fileId} (status ${resp.status}): ${resp.data}`
      );
    }

    const filePath = path.join(downloadDir, fileName);
    fs.writeFileSync(filePath, resp.data);
    savedPaths.push(filePath);
  }

  return savedPaths;
}

export async function data_analyzer(userQuery) {
  const finalResult = { assistant_response: '', file_paths: null };

  const response = await createResponse(userQuery);
  const message = response.message || '';
  const containerId = response.container_id;

  if (containerId) {
    let containerFiles;
    try {
      containerFiles = await retrieveContainerFiles(containerId);
    } catch (e) {
      finalResult.assistant_response = `${message}. Unable to list files for processing.`;
      return finalResult;
    }

    const filesList = containerFiles.files || [];
    if (filesList.length > 0) {
      try {
        const savedFilePaths = await downloadContainerFile(containerFiles);
        finalResult.file_paths = savedFilePaths;
      } catch {
        finalResult.assistant_response = `${message}. An unexpected error occurred while creating the files. Please try again later.`;
        return finalResult;
      }
    }
  }

  finalResult.assistant_response = message;
  return finalResult;
}

// --- Route ---
router.post("/", async (req, res) => {
  try {
    const { query } = req.body ?? {};
    const normalized = normalizeInput(query);

    if (!normalized) {
      return res.status(400).json({
        error: "Body must include a non-empty 'query' string (or object with 'item').",
      });
    }

    const result = await data_analyzer(normalized);
    return res.json(result);
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
