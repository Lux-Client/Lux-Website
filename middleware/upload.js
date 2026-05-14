const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const runtimeDataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '../data');
const uploadDir = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(runtimeDataDir, 'uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit (V15)
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.zip', '.luxextension', '.png', '.jpg', '.jpeg', '.webp', '.json'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed. Only .zip, .luxextension, and .json (and common images) are permitted.'));
        }
    }
});

module.exports = upload;

