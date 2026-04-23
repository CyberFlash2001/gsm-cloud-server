const express = require("express");
const mysql = require("mysql2/promise");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  ssl: {
    minVersion: "TLSv1.2",
    rejectUnauthorized: false
  }
};

let pool = null;
let dbInitError = null;

async function initDb() {
  pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
  });

  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  console.log("MySQL connected");
}

app.get("/", (req, res) => {
  if (dbInitError) {
    return res.status(500).send("API started, but database connection failed");
  }
  res.send("API running");
});

app.get("/health", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ ok: false, error: dbInitError || "DB pool not ready" });
    }
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows[0].ok === 1 });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/telemetry", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ ok: false, error: dbInitError || "Database not connected" });
    }

    const { device_id, voltage, current, temperature, gsm_signal } = req.body;

    if (
      device_id === undefined ||
      voltage === undefined ||
      current === undefined ||
      temperature === undefined
    ) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields"
      });
    }

    const sql = `
      INSERT INTO telemetry
      (device_id, voltage, current, temperature, gsm_signal, created_at)
      VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
    `;

    await pool.execute(sql, [
      device_id,
      voltage,
      current,
      temperature,
      gsm_signal ?? null
    ]);

    res.status(200).json({ ok: true, message: "Data stored" });
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    dbInitError = err.message;
    console.error("DB init failed:", err);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} without DB`);
    });
  });
