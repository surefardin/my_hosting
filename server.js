const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// আপলোড করা ফাইলের জন্য পাবলিক ডিরেক্টরি সেটআপ
const uploadsDir = path.join(__dirname, 'hosted_site');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// SQLite Database Setup
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// ডাটাবেসে টেবিল তৈরি করা
db.serialize(() => {
    // ইউজার টেবিল
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
    `);

    // সাইট/ফাইল টেবিল
    db.run(`
        CREATE TABLE IF NOT EXISTS sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            site_name TEXT UNIQUE,
            file_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);
});

// Multer Config: শুধু HTML ফাইল আপলোড অনুমোদন করবে
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'hosted_site');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.html' || ext === '.htm') {
            cb(null, true);
        } else {
            cb(new Error('শুধু HTML (.html/.htm) ফাইল আপলোড করা যাবে!'));
        }
    }
});

// ==================== ROUTES ====================

// ১. রেজিস্টার / লগইন API (সিম্পল ডেমো লজিক)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'ইউজারনেম এবং পাসওয়ার্ড প্রদান করুন।' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

        if (user) {
            if (user.password === password) {
                return res.json({ message: 'লগইন সফল হয়েছে!', user: { id: user.id, username: user.username } });
            } else {
                return res.status(401).json({ error: 'ভুল পাসওয়ার্ড!' });
            }
        } else {
            // ইউজার না থাকলে নতুন একাউন্ট তৈরি
            db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'নতুন একাউন্ট তৈরি করে লগইন করা হয়েছে!', user: { id: this.lastID, username } });
            });
        }
    });
});

// ২. HTML ফাইল আপলোড API
app.post('/api/upload', upload.single('htmlFile'), (req, res) => {
    const { userId, siteName } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'অনুগ্রহ করে একটি HTML ফাইল সিলেক্ট করুন।' });
    }
    if (!siteName || !userId) {
        return res.status(400).json({ error: 'সাইটের নাম এবং ইউজার আইডি প্রয়োজন।' });
    }

    // সাইটের নাম ছোট হাতের অক্ষর এবং স্পেস ছাড়া করে নেওয়া
    const cleanSiteName = siteName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

    db.run(
        'INSERT INTO sites (user_id, site_name, file_path) VALUES (?, ?, ?)',
        [userId, cleanSiteName, req.file.filename],
        function (err) {
            if (err) {
                // ফাইল আপলোড কিন্তু ডাটাবেসে ভুল হলে ফাইল ডিলিট করে দেওয়া
                fs.unlinkSync(req.file.path);
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'এই নামের সাইটটি আগেই তৈরি করা হয়েছে। অন্য নাম দিন।' });
                }
                return res.status(500).json({ error: err.message });
            }

            const liveUrl = `/site/${cleanSiteName}`;
            res.json({
                message: 'ফাইল সফলভাবে আপলোড এবং পাবলিশ হয়েছে!',
                siteName: cleanSiteName,
                url: liveUrl
            });
        }
    );
});

// ৩. লাইভ সাইট ভিউ করার Route
app.get('/site/:siteName', (req, res) => {
    const siteName = req.params.siteName.toLowerCase();

    db.get('SELECT file_path FROM sites WHERE site_name = ?', [siteName], (err, row) => {
        if (err || !row) {
            return res.status(404).send('<h2>৪০৪: সাইটটি খুঁজে পাওয়া যায়নি!</h2>');
        }

        const filePath = path.join(uploadsDir, row.file_path);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('<h2>ফাইলটি সার্ভার থেকে মুছে ফেলা হয়েছে।</h2>');
        }
    });
});

// সার্ভার চালু করা
app.listen(PORT, () => {
    console.log(`সার্ভার চলছে: http://localhost:${PORT}`);
});
