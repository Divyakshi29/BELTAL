import bulkImportService from '../services/bulkImport.service.js';
import ApiError from '../utils/ApiError.js';

/**
 * Pulls the CSV text out of either an uploaded file (multipart/form-data, the
 * admin UI's file picker) or a JSON body carrying the text directly (scripts
 * and curl). One import endpoint, two convenient ways to feed it.
 */
function readCsv(req) {
  if (req.file?.buffer) return req.file.buffer.toString('utf8');
  if (typeof req.body?.csv === 'string' && req.body.csv.trim()) return req.body.csv;
  throw new ApiError(
    400,
    'Provide the CSV as an uploaded file (field name "file") or as a "csv" string in the JSON body'
  );
}

/**
 * POST /api/admin/identities/bulk-import/validate — dry run (issue #51).
 * Parses and validates the file, reports every bad row, and previews the DIDs
 * that would be generated. Writes nothing and sends no transaction.
 */
export const validateBulkImport = async (req, res, next) => {
  try {
    const report = await bulkImportService.validateCsv(readCsv(req));
    // `valid` carries the full internal rows; the response only needs the preview.
    const { valid, ...response } = report;
    return res.status(200).json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/identities/bulk-import — commit the import.
 * Refuses outright if any row is invalid, and says which ones, before any
 * on-chain call happens.
 */
export const runBulkImport = async (req, res, next) => {
  try {
    const result = await bulkImportService.importCsv(readCsv(req), { actorId: req.user?.id });
    return res.status(result.partialFailure ? 207 : 201).json({ success: true, data: result });
  } catch (error) {
    // The per-row validation report is the useful part of this failure, and
    // the shared error handler only forwards a message — so send it here.
    if (error?.details?.invalidRows) {
      return res.status(error.status || 422).json({
        success: false,
        message: error.message,
        data: error.details,
      });
    }
    next(error);
  }
};

export default { validateBulkImport, runBulkImport };
