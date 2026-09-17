require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const nodemailer = require('nodemailer');

const User = require('./models/User');
const Inventory = require('./models/Inventory');
const DailyRecord = require('./models/DailyRecord');

const app = express();

app.use(express.json());
app.use(cors({ origin: '*' }));
app.use(express.static(path.join(__dirname)));

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_123';

// إعداد Nodemailer لإرسال الإيميلات عبر Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // بريد الجيميل الخاص بك
    pass: process.env.EMAIL_PASS  // كلمة مرور التطبيق (App Password) من حساب جوجل
  }
});

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ================= AUTH ROUTES =================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ message: 'اسم المستخدم أو البريد مستخدم بالفعل' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);
    res.status(201).json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }]
    });
    if (!user) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إرسال الـ OTP الحقيقي عبر البريد الإلكتروني
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { identifier } = req.body;
    const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
    
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });
    if (!user.email) return res.status(400).json({ message: 'هذا الحساب لا يملك بريد إلكتروني مسجل' });

    // توليد OTP وتحديد وقت انتهائه بعد 5 دقائق
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; 
    await user.save();

    // إرسال الإيميل
    const mailOptions = {
      from: `"PlayStation Lounge" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'رمز إعادة تعيين كلمة المرور (OTP)',
      html: `
        <div style="direction: rtl; font-family: Cairo, sans-serif; padding: 20px; background-color: #f4f4f9;">
          <h2 style="color: #00f0ff;">طلب إعادة تعيين كلمة المرور</h2>
          <p>أهلاً ${user.username}،</p>
          <p>رمز التحقق الخاص بك لاستعادة الحساب هو:</p>
          <h1 style="color: #7000ff; letter-spacing: 5px; background: #eee; padding: 10px; display: inline-block;">${otp}</h1>
          <p>هذا الرمز صالحة لمدة <b>5 دقائق فقط</b>.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'تم إرسال رمز OTP إلى بريدك الإلكتروني بنجاح' });
  } catch (err) {
    console.error('OTP Send Error:', err);
    res.status(500).json({ message: 'حدث خطأ أثناء إرسال البريد الإلكتروني' });
  }
});

// إعادة تعيين كلمة المرور مع التحقق من الـ OTP
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;
    const user = await User.findOne({ 
      $or: [{ email: identifier }, { username: identifier }], 
      otp 
    });

    if (!user) return res.status(400).json({ message: 'رمز OTP غير صحيح' });
    if (user.otpExpires && Date.now() > user.otpExpires) {
      return res.status(400).json({ message: 'انتهت صلاحية الرمز، يرجى طلب رمز جديد' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= INVENTORY ROUTES =================
app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Inventory.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const { name, price, stock } = req.body;
    const item = new Inventory({ name, price, stock });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    await Inventory.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف المنتج' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory/sell/:id', async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item || item.stock <= 0) return res.status(400).json({ message: 'المخزون غير كافٍ' });

    item.stock -= 1;
    await item.save();

    const today = new Date().toISOString().split('T')[0];
    await DailyRecord.findOneAndUpdate(
      { date: today },
      { $inc: { drinksIncome: item.price } },
      { upsert: true, new: true }
    );

    res.json({ message: 'تم البيع بنجاح', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= DAILY RECORDS ROUTES =================
app.get('/api/records', async (req, res) => {
  try {
    const records = await DailyRecord.find().sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/records/add-device-income', async (req, res) => {
  try {
    const { amount } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const record = await DailyRecord.findOneAndUpdate(
      { date: today },
      { $inc: { devicesIncome: amount } },
      { upsert: true, new: true }
    );

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;