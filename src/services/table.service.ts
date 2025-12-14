import { db } from '../database/db';
import { tables, NewTable } from '../database/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';

export class TableService {
  /**
   * Get all tables
   */
  async getAllTables() {
    return await db.select().from(tables).orderBy(desc(tables.createdAt));
  }

  /**
   * Get tables by tenant ID
   */
  async getTablesByTenant(tenantId: string) {
    return await db
      .select()
      .from(tables)
      .where(eq(tables.tenantId, tenantId))
      .orderBy(tables.tableNumber);
  }

  /**
   * Get table by ID
   */
  async getTableById(id: string) {
    const [table] = await db.select().from(tables).where(eq(tables.id, id)).limit(1);

    return table || null;
  }

  /**
   * Get multiple tables by IDs (batch fetch)
   */
  async getTablesByIds(ids: string[], tenantId: string) {
    if (ids.length === 0) return [];
    
    return await db
      .select()
      .from(tables)
      .where(and(inArray(tables.id, ids), eq(tables.tenantId, tenantId)))
      .orderBy(tables.tableNumber);
  }

  /**
   * Get table by number and tenant
   */
  async getTableByNumber(tableNumber: string, tenantId: string) {
    const [table] = await db
      .select()
      .from(tables)
      .where(and(eq(tables.tableNumber, tableNumber), eq(tables.tenantId, tenantId)))
      .limit(1);

    return table || null;
  }

  /**
   * Create new table
   */
  async createTable(tableData: Omit<NewTable, 'id' | 'createdAt' | 'updatedAt'>) {
    const newTable: NewTable = {
      ...tableData,
      status: tableData.status || 'active',
    };

    const result = await db.insert(tables).values(newTable).returning();

    return result[0];
  }

  /**
   * Update table
   */
  async updateTable(id: string, updates: Partial<NewTable>) {
    const result = await db
      .update(tables)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tables.id, id))
      .returning();

    return result[0] || null;
  }

  /**
   * Delete table
   */
  async deleteTable(id: string) {
    const result = await db.delete(tables).where(eq(tables.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update table status
   */
  async updateTableStatus(id: string, status: 'active' | 'inactive') {
    return await this.updateTable(id, { status });
  }

  /**
   * Get active tables count by tenant
   */
  async getActiveTableCountByTenant(tenantId: string) {
    const result = await db
      .select({ count: tables.id })
      .from(tables)
      .where(and(eq(tables.tenantId, tenantId), eq(tables.status, 'active')));

    return result.length;
  }

  /**
   * Check if table exists and is active
   */
  async isTableActive(id: string) {
    const table = await this.getTableById(id);
    return table?.status === 'active';
  }
}
