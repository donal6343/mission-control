import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { WORKSPACE_PATH } from "./constants";

export async function readWorkspaceFile(relativePath: string): Promise<string | null> {
  try {
    const content = await readFile(join(WORKSPACE_PATH, relativePath), "utf-8");
    return content;
  } catch {
    return null;
  }
}

export async function readWorkspaceJson<T = unknown>(relativePath: string): Promise<T | null> {
  const content = await readWorkspaceFile(relativePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function listWorkspaceDir(relativePath: string): Promise<string[]> {
  try {
    return await readdir(join(WORKSPACE_PATH, relativePath));
  } catch {
    return [];
  }
}

export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await stat(join(WORKSPACE_PATH, relativePath));
    return true;
  } catch {
    return false;
  }
}
