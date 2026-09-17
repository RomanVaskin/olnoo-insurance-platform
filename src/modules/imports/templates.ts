import { buildTemplateWorkbook, type TemplateColumn } from './xlsx';

export const IMPORT_TYPES = ['federations', 'athletes', 'products', 'assignments'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

const TEMPLATE_COLUMNS: Record<ImportType, TemplateColumn[]> = {
  federations: [
    { header: 'name', example: 'Федерация плавания' },
    { header: 'slug', example: 'swimming-federation' },
    { header: 'status', example: 'active' },
  ],
  athletes: [
    { header: 'last_name', example: 'Иванов' },
    { header: 'first_name', example: 'Иван' },
    { header: 'patronymic', example: 'Иванович' },
    { header: 'birth_date', example: '2005-03-12' },
    { header: 'gender', example: 'male' },
    { header: 'email', example: 'ivanov@example.dev' },
    { header: 'phone', example: '+79001234567' },
    { header: 'federation', example: 'swimming-federation' },
    { header: 'club', example: 'СК Дельфин' },
    { header: 'coach', example: 'Петров П.П.' },
    { header: 'grade', example: '1 разряд' },
    { header: 'weight', example: 65.5 },
    { header: 'sport_name', example: 'Плавание' },
  ],
  products: [
    { header: 'name', example: 'Страховка пловца' },
    { header: 'category', example: 'sport' },
    { header: 'insurer_name', example: 'ОЛНОО Страхование' },
    { header: 'coverage_amount', example: 500000 },
    { header: 'validity_days', example: 365 },
    { header: 'base_price', example: 1500 },
    { header: 'status', example: 'active' },
  ],
  assignments: [
    { header: 'federation', example: 'swimming-federation' },
    { header: 'product', example: 'Страховка пловца' },
    { header: 'price', example: 1500 },
    { header: 'active', example: 'true' },
  ],
};

export function buildTemplate(type: ImportType): Promise<Buffer> {
  return buildTemplateWorkbook(TEMPLATE_COLUMNS[type]);
}
