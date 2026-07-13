import { Injectable } from '@angular/core';
import * as duckdb from '@duckdb/duckdb-wasm';

@Injectable({
  providedIn: 'root',
})
export class DuckDbService {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private readonly virtualFileName = 'static_data.parquet';

  async initDatabase(parquetUrl: string): Promise<void> {
    if (this.db) return;

    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], {
        type: 'text/javascript',
      }),
    );
    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();

    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);

    this.conn = await this.db.connect();

    await this.db.registerFileURL(
      this.virtualFileName,
      parquetUrl,
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
  }

  async queryParquet(sqlQuery: string): Promise<any[]> {
    if (!this.db || !this.conn) {
      throw new Error('DuckDB initialization failed.');
    }

    const processedQuery = sqlQuery.replace('DATA_FILE', this.virtualFileName);
    const arrowTable = await this.conn.query(processedQuery);

    return arrowTable.toArray().map((row) => row.toJSON());
  }
}
