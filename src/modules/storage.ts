import fs from "fs/promises";
import path from "path";

export class Storage {
  private dataDir = "data";

  async save<T>(collection: string, id: string, data: T): Promise<void> {
    const dir = path.join(this.dataDir, collection);

    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, `${id}.json`);

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async load<T>(collection: string, id: string): Promise<T | null> {
    try {
      const filePath = path.join(this.dataDir, collection, `${id}.json`);

      const content = await fs.readFile(filePath, "utf-8");

      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async exists(collection: string, id: string): Promise<boolean> {
    try {
      const filePath = path.join(this.dataDir, collection, `${id}.json`);

      await fs.access(filePath);

      return true;
    } catch {
      return false;
    }
  }

  async list(collection: string): Promise<string[]> {
    const dir = path.join(this.dataDir, collection);

    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  async getNextSequence(collection: string): Promise<number> {
    const files = await this.list(collection);

    return files.length + 1;
  }
}

export const storage = new Storage();