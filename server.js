const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// আপলোড ফোল্ডার তৈরি করা
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// ফাইল সেভ করার সেটিংস
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const siteName = req.body.siteName ? req.body.siteName.replace(/[^a-zA-Z0-9]/g, '') : Date.now();
        cb(null, siteName + '.html');
    }
});
const upload = multer({ storage: storage });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// public ফোল্ডারের index.html দেখানোর জন্য
app.use(express.static(path.join(__dirname, 'public')));

// আপলোড করা ফাইলগুলো /sites লিংকে দেখানোর জন্য
app.use('/sites', express.static(uploadDir));

// ফাইল আপলোড করার রিকোয়েস্ট
app.post('/upload', upload.single('siteFile'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const siteName = req.body.siteName ? req.body.siteName.replace(/[^a-zA-Z0-9]/g, '') : req.file.filename.split('.')[0];
    res.send({ success: true, url: `/sites/${siteName}.html` });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
