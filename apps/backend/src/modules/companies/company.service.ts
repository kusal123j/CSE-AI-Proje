import { AppError } from '../../middleware/errorHandler';
import { upperSymbol } from '../../utils/slugify';
import * as repo from './company.repository';

export const companyService = {
  async create(input: repo.CreateCompanyData) {
    const symbol = upperSymbol(input.symbol);
    const existing = await repo.findCompanyBySymbol(symbol);
    if (existing) {
      throw new AppError(409, `Company already exists for symbol ${symbol}`);
    }

    return repo.createCompany({ ...input, symbol });
  },

  list() {
    return repo.listCompanies();
  },

  async getBySymbol(symbolInput: string) {
    const symbol = upperSymbol(symbolInput);
    const company = await repo.findCompanyBySymbol(symbol);
    if (!company) {
      throw new AppError(404, `Company not found for symbol ${symbol}`);
    }
    return company;
  },

  async update(symbolInput: string, input: repo.UpdateCompanyData) {
    const symbol = upperSymbol(symbolInput);
    const company = await repo.updateCompany(symbol, input);
    if (!company) {
      throw new AppError(404, `Company not found for symbol ${symbol}`);
    }
    return company;
  }
};
