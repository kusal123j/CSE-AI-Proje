import { query } from '../../config/database';

export interface CreateCompanyData {
  symbol: string;
  name: string;
  sector?: string | null;
}

export interface UpdateCompanyData {
  name?: string;
  sector?: string | null;
  isActive?: boolean;
}

export async function createCompany(data: CreateCompanyData) {
  const result = await query(
    `INSERT INTO companies (symbol, name, sector)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [data.symbol, data.name, data.sector ?? null]
  );
  return result.rows[0];
}

export async function listCompanies() {
  const result = await query(`SELECT * FROM companies ORDER BY symbol ASC`);
  return result.rows;
}

export async function findCompanyBySymbol(symbol: string) {
  const result = await query(`SELECT * FROM companies WHERE symbol = $1 LIMIT 1`, [symbol]);
  return result.rows[0] ?? null;
}

export async function updateCompany(symbol: string, data: UpdateCompanyData) {
  const current = await findCompanyBySymbol(symbol);
  if (!current) return null;

  const result = await query(
    `UPDATE companies
     SET name = COALESCE($2, name),
         sector = COALESCE($3, sector),
         is_active = COALESCE($4, is_active)
     WHERE symbol = $1
     RETURNING *`,
    [symbol, data.name ?? null, data.sector ?? null, data.isActive ?? null]
  );
  return result.rows[0] ?? null;
}
