import { invoke } from "@tauri-apps/api/core";

/**
 * Cliente del motor de base de datos cifrada (SQLCipher en Rust).
 *
 * Reemplaza a @tauri-apps/plugin-sql conservando su API exacta —
 * `Database.load()`, `select()` y `execute()` — para que db.ts no cambie:
 * los placeholders $1..$N y las formas de retorno son las mismas. La clave
 * vive en el Llavero de macOS y la abre Rust al arrancar; aquí solo se
 * invocan los comandos.
 */

export interface QueryResult {
  rowsAffected: number;
  lastInsertId: number;
}

export default class Database {
  private static instancia: Database | null = null;

  /** La conexión real la abre Rust en el arranque; esto solo entrega el cliente. */
  static async load(_url: string): Promise<Database> {
    if (!Database.instancia) Database.instancia = new Database();
    return Database.instancia;
  }

  async select<T>(query: string, params: unknown[] = []): Promise<T> {
    return await invoke<T>("db_select", { query, params });
  }

  async execute(query: string, params: unknown[] = []): Promise<QueryResult> {
    return await invoke<QueryResult>("db_execute", { query, params });
  }
}
