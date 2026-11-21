import * as XLSX from 'xlsx';

export interface RowError {
  row: number;
  field: string;
  value: any;
  message: string;
}

export interface CandidateRowInput {
  fullName: string;
  phone: string;
  email?: string;
  nationalId: string;
  grade: string;
  completionDate?: string;
}

export interface ValidationResult {
  isValid: boolean;
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  errors: RowError[];
  preview: (CandidateRowInput & { row: number; errors: string[] })[];
}

const REQUIRED_COLUMNS = ['fullName', 'phone', 'nationalId', 'grade'];
const VALID_GRADES = ['A+', 'A', 'B', 'Pass'];

// Maps common header variants to standardized keys and strips carriage returns
export const normalizeHeaders = (row: Record<string, any>): Record<string, any> => {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanVal = typeof value === 'string' ? value.replace(/[\r\n]/g, '').trim() : value;

    if (cleanKey.includes('fullname') || cleanKey.includes('name') || cleanKey === 'candidatename') {
      normalized['fullName'] = String(cleanVal || '').trim();
    } else if (cleanKey.includes('phone') || cleanKey.includes('mobile') || cleanKey === 'contact') {
      normalized['phone'] = String(cleanVal || '').trim();
    } else if (cleanKey.includes('email') || cleanKey.includes('mail')) {
      normalized['email'] = String(cleanVal || '').trim();
    } else if (cleanKey.includes('nationalid') || cleanKey.includes('aadhaar') || cleanKey.includes('idnumber')) {
      normalized['nationalId'] = String(cleanVal || '').trim();
    } else if (cleanKey.includes('grade') || cleanKey.includes('score') || cleanKey === 'result') {
      normalized['grade'] = String(cleanVal || '').trim();
    } else if (cleanKey.includes('completion') || cleanKey.includes('date')) {
      normalized['completionDate'] = String(cleanVal || '').trim();
    } else {
      normalized[key] = cleanVal;
    }
  }
  return normalized;
};

export const parseSpreadsheet = (buffer: Buffer, filename: string): Record<string, any>[] => {
  const isCsv = filename.toLowerCase().endsWith('.csv');
  const isXlsx = filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls');

  if (!isCsv && !isXlsx) {
    throw new Error('Unsupported file format. Please upload a .csv or .xlsx spreadsheet.');
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded spreadsheet contains no sheets.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (rawRows.length === 0) {
    throw new Error('The uploaded spreadsheet contains no candidate data.');
  }

  return rawRows.map(normalizeHeaders);
};

export const validateCandidateRows = (rows: Record<string, any>[]): ValidationResult => {
  const errors: RowError[] = [];
  const preview: (CandidateRowInput & { row: number; errors: string[] })[] = [];

  // Check required column headers from first row
  const firstRow = rows[0] || {};
  const missingHeaders = REQUIRED_COLUMNS.filter((col) => !(col in firstRow));
  if (missingHeaders.length > 0) {
    throw new Error(
      `Missing mandatory columns in spreadsheet: ${missingHeaders.join(', ')}. Please use the official template.`
    );
  }

  const seenNationalIds = new Map<string, number>(); // nationalId -> row number

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // Row 1 is header in Excel/CSV
    const rowErrors: string[] = [];

    const fullName = String(row.fullName || '').replace(/[\r\n]/g, '').trim();
    const phone = String(row.phone || '').replace(/[\r\n]/g, '').trim();
    const email = row.email ? String(row.email).replace(/[\r\n]/g, '').trim() : undefined;
    const nationalId = String(row.nationalId || '').replace(/[\r\n]/g, '').trim();
    const grade = String(row.grade || '').replace(/[\r\n]/g, '').trim();
    const rawDate = row.completionDate ? String(row.completionDate).replace(/[\r\n]/g, '').trim() : '';
    const completionDate = rawDate || new Date().toISOString().split('T')[0];

    // 1. Full Name Validation
    if (!fullName) {
      const msg = 'Candidate full name is missing';
      errors.push({ row: rowNum, field: 'fullName', value: fullName, message: msg });
      rowErrors.push(msg);
    } else if (fullName.length < 3) {
      const msg = 'Candidate full name must be at least 3 characters';
      errors.push({ row: rowNum, field: 'fullName', value: fullName, message: msg });
      rowErrors.push(msg);
    }

    // 2. Phone Validation (Must be exactly 10 digits for Indian mobile numbers)
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    const cleanPhone = digitsOnly.length > 10 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;
    if (!phone) {
      const msg = 'Mobile phone number is missing';
      errors.push({ row: rowNum, field: 'phone', value: phone, message: msg });
      rowErrors.push(msg);
    } else if (cleanPhone.length !== 10) {
      const msg = `Invalid mobile number "${phone}". Must be a valid 10-digit number.`;
      errors.push({ row: rowNum, field: 'phone', value: phone, message: msg });
      rowErrors.push(msg);
    }

    // 3. Email Validation (optional but if provided must be valid)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const msg = `Invalid email format: "${email}"`;
      errors.push({ row: rowNum, field: 'email', value: email, message: msg });
      rowErrors.push(msg);
    }

    // 4. National ID / Aadhaar Validation & Spreadsheet Duplicate Check
    if (!nationalId) {
      const msg = 'National ID / Aadhaar hash is missing';
      errors.push({ row: rowNum, field: 'nationalId', value: nationalId, message: msg });
      rowErrors.push(msg);
    } else if (nationalId.length < 6) {
      const msg = `National ID "${nationalId}" is too short. Minimum 6 characters required.`;
      errors.push({ row: rowNum, field: 'nationalId', value: nationalId, message: msg });
      rowErrors.push(msg);
    } else if (seenNationalIds.has(nationalId.toUpperCase())) {
      const prevRow = seenNationalIds.get(nationalId.toUpperCase());
      const msg = `Duplicate candidate in spreadsheet: ID "${nationalId}" was already enrolled on Row ${prevRow}.`;
      errors.push({ row: rowNum, field: 'nationalId', value: nationalId, message: msg });
      rowErrors.push(msg);
    } else {
      seenNationalIds.set(nationalId.toUpperCase(), rowNum);
    }

    // 5. Grade Validation
    if (!grade) {
      const msg = 'Assessment grade is missing';
      errors.push({ row: rowNum, field: 'grade', value: grade, message: msg });
      rowErrors.push(msg);
    } else if (!VALID_GRADES.includes(grade)) {
      const msg = `Invalid grade "${grade}". Must be one of: ${VALID_GRADES.join(', ')}`;
      errors.push({ row: rowNum, field: 'grade', value: grade, message: msg });
      rowErrors.push(msg);
    }

    preview.push({
      row: rowNum,
      fullName,
      phone: cleanPhone ? `+91${cleanPhone}` : phone,
      email,
      nationalId,
      grade,
      completionDate,
      errors: rowErrors,
    });
  });

  const errorRowsCount = preview.filter((p) => p.errors.length > 0).length;
  const validRowsCount = preview.length - errorRowsCount;

  return {
    isValid: errors.length === 0,
    totalRows: rows.length,
    validRowsCount,
    errorRowsCount,
    errors,
    preview,
  };
};
