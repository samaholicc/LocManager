require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const db = require("./mysql_connect");
const dashB = require("./routes/dashb");
const { param, validationResult } = require("express-validator");
const { sendVerificationEmail } = require("./utils/email");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");
const axios = require("axios");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "locmanagers@gmail.com",
    pass: "alsk sdnf hzjx labx",
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.error("Nodemailer configuration error:", error);
  } else {
    console.log("Nodemailer is ready to send emails");
  }
});

const port = 5000;

const validateUserType = [
  param("userType")
    .isIn(["admin", "tenant", "owner", "employee"])
    .withMessage("Invalid userType"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
  },
];

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
console.log("WEATHER_API_KEY:", process.env.WEATHER_API_KEY);

app.use((req, res, next) => {
  console.log("Handling request:", req.method, req.url);
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  // Add 'whom' here:
  res.header("Access-Control-Allow-Headers", "Content-Type, whom");
  
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight for:", req.url);
    return res.status(200).end();
  }
  next();
});


app.use("/dashboard", dashB);

// Fetch owner details
app.post("/owner", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    const sql = `
      SELECT owner_id, name, room_no, email, is_email_verified
      FROM owner 
      WHERE owner_id = ?
    `;
    const results = await db.query(sql, [numericId]);
    if (!results || results.length === 0) {
      return res.status(404).json({ error: "Owner not found for userId: " + numericId });
    }
    res.json({ owner: results[0] });
  } catch (err) {
    console.error("Erreur serveur in /owner:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch tenant details
app.post("/tenant", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    const sql = `
      SELECT tenant_id, name, dob, age, room_no, email, is_email_verified
      FROM tenant 
      WHERE tenant_id = ?
    `;
    const results = await db.query(sql, [numericId]);
    if (!results || results.length === 0) {
      return res.status(404).json({ error: "Tenant not found for userId: " + numericId });
    }
    res.json(results);
  } catch (err) {
    console.error("Erreur serveur in /tenant:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});
// Logout endpoint
app.post("/logout", async (req, res) => {
  const { userId } = req.body;
  console.log("Received /logout request:", { userId });

  if (!userId) {
    console.log("Missing userId in request body");
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    if (isNaN(numericId)) {
      console.log("Invalid userId format:", userId);
      return res.status(400).json({ error: "Invalid userId format" });
    }

    // Log the logout activity
    const activitySql = "INSERT INTO activities (user_id, action, date) VALUES (?, ?, NOW())";
    await db.query(activitySql, [numericId, "Déconnexion utilisateur"]);

    res.status(200).json({ message: "Déconnexion réussie" });
  } catch (err) {
    console.error("Error during logout:", err);
    res.status(500).json({ error: "Erreur serveur lors de la déconnexion: " + err.message });
  }
});
// Default route
app.get("/", function (req, res) {
  res.send("Only accepting GET and POST requests!");
});

// Send support message
app.post("/send-support-message", async (req, res) => {
  const { userId, userType, name, email, subject, message } = req.body;

  if (!userId || !userType || !name || !email || !subject || !message) {
    return res.status(400).json({ error: "Tous les champs sont requis" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Adresse e-mail invalide" });
  }

  const mailOptions = {
    from: `"LocManager Support Request" <${email}>`,
    to: "support@locmanager.com",
    subject: `Support Request: ${subject}`,
    text: `
      New support message from ${name} (${userType}, ID: ${userId})
      Email: ${email}
      Subject: ${subject}
      Message: ${message}
    `,
    html: `
      <h2>New Support Message</h2>
      <p><strong>From:</strong> ${name} (${userType}, ID: ${userId})</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Message envoyé avec succès" });
  } catch (error) {
    console.error("Error sending support email:", error);
    res.status(500).json({ error: "Échec de l'envoi du message. Veuillez réessayer plus tard." });
  }
});

// Authenticate user
app.post("/auth", async (req, res) => {
  console.log("Received /auth request:", req.body);
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
  }

  let rep = "unknown";
  if (username.toUpperCase().charAt(0) === "E" && password.length >= 6) rep = "employee";
  else if (username.toUpperCase().charAt(0) === "A" && password.length >= 6) rep = "admin";
  else if (username.toUpperCase().charAt(0) === "T" && password.length >= 6) rep = "tenant";
  else if (username.toUpperCase().charAt(0) === "O" && password.length >= 6) rep = "owner";

  try {
    const authTableMap = {
      admin: "auth_admin",
      owner: "auth_owner",
      tenant: "auth_tenant",
      employee: "auth_employee",
    };

    const authTable = authTableMap[rep];
    if (!authTable) {
      return res.status(400).json({ error: "Invalid user type" });
    }

    const numericId = parseInt(username.substring(2));
    const authSql = `SELECT id FROM ${authTable} WHERE id = ? AND password = ?`;
    const authResult = await db.query(authSql, [numericId, password]);

    if (!authResult || authResult.length === 0) {
      return res.json({ access: "denied", user: rep });
    }

    const authId = authResult[0].id;
    console.log("Auth ID for username", username, ":", authId);

    let isEmailVerified = false;
    let verificationSql;
    if (rep === "admin") {
      verificationSql = "SELECT is_email_verified FROM block_admin WHERE admin_id = ?";
    } else if (rep === "tenant") {
      verificationSql = "SELECT is_email_verified FROM tenant WHERE tenant_id = ?";
    } else if (rep === "owner") {
      verificationSql = "SELECT is_email_verified FROM owner WHERE owner_id = ?";
    } else if (rep === "employee") {
      verificationSql = "SELECT is_email_verified FROM employee WHERE emp_id = ?";
    }

    const verificationResult = await db.query(verificationSql, [authId]);
    if (!verificationResult || verificationResult.length === 0) {
      console.error(`No ${rep} record found for ${rep}_id:`, authId);
      return res.status(404).json({ error: `Utilisateur ${rep} non trouvé dans la table correspondante` });
    }

    isEmailVerified = verificationResult[0].is_email_verified;

    if (!isEmailVerified) {
      return res.status(403).json({ error: "Veuillez vérifier votre adresse e-mail avant de vous connecter." });
    }

    const activitySql = "INSERT INTO activities (user_id, action, date) VALUES (?, ?, NOW())";
    await db.query(activitySql, [authId, "Connexion utilisateur"]);

    if (rep === "admin") {
      const adminSql = "SELECT admin_id FROM block_admin WHERE admin_id = ?";
      const adminResult = await db.query(adminSql, [authId]);
      if (!adminResult || adminResult.length === 0) {
        console.error("No admin record found for admin_id:", authId);
        return res.status(404).json({ error: "Admin non trouvé dans la table block_admin" });
      }

      const adminIdFromDb = adminResult[0].admin_id;
      console.log("Admin ID for admin_id", authId, ":", adminIdFromDb);
      res.json({ access: "granted", user: rep, userType: rep, username, adminId: adminIdFromDb });
    } else {
      res.json({ access: "granted", user: rep, userType: rep, username });
    }
  } catch (err) {
    console.error("Erreur lors de l'authentification:", err);
    res.status(500).json({ error: "Erreur serveur lors de l'authentification" });
  }
});

// Verify email
app.get("/verify-email", async (req, res) => {
  const { userId, userType, token } = req.query;

  if (!userId || !userType || !token) {
    return res.redirect(`${process.env.FRONTEND_URL}/verified?error=${encodeURIComponent("Missing required query parameters")}`);
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    let sql;
    if (userType === "admin") {
      sql = "SELECT is_email_verified FROM block_admin WHERE admin_id = ?";
    } else if (userType === "tenant") {
      sql = "SELECT is_email_verified FROM tenant WHERE tenant_id = ?";
    } else if (userType === "owner") {
      sql = "SELECT is_email_verified FROM owner WHERE owner_id = ?";
    } else if (userType === "employee") {
      sql = "SELECT is_email_verified FROM employee WHERE emp_id = ?";
    } else {
      return res.redirect(`${process.env.FRONTEND_URL}/verified?error=${encodeURIComponent("Invalid userType")}`);
    }

    const result = await db.query(sql, [numericId]);
    if (!result || result.length === 0) {
      return res.redirect(`${process.env.FRONTEND_URL}/verified?error=${encodeURIComponent("Utilisateur non trouvé dans la table correspondante")}`);
    }

    if (result[0].is_email_verified) {
      return res.redirect(`${process.env.FRONTEND_URL}/verified?message=${encodeURIComponent("Email already verified")}`);
    }

    const isVerified = await db.verifyEmailToken(userId, userType, token);
    if (!isVerified) {
      return res.redirect(`${process.env.FRONTEND_URL}/verified?error=${encodeURIComponent("Invalid or expired verification token")}`);
    }

    res.redirect(`${process.env.FRONTEND_URL}/verified?message=${encodeURIComponent("Email verified successfully")}`);
  } catch (err) {
    console.error("Error verifying email:", err);
    res.redirect(`${process.env.FRONTEND_URL}/verified?error=${encodeURIComponent("Server error: " + err.message)}`);
  }
});

// Resend verification email
app.post("/resend-verification", async (req, res) => {
  const { userId, userType } = req.body;
  if (!userId || !userType) {
    return res.status(400).json({ error: "Missing userId or userType" });
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    await db.query("START TRANSACTION");

    try {
      let sql;
      if (userType === "admin") {
        sql = "SELECT email, is_email_verified FROM block_admin WHERE admin_id = ? FOR UPDATE";
      } else if (userType === "tenant") {
        sql = "SELECT email, is_email_verified FROM tenant WHERE tenant_id = ? FOR UPDATE";
      } else if (userType === "owner") {
        sql = "SELECT email, is_email_verified FROM owner WHERE owner_id = ? FOR UPDATE";
      } else if (userType === "employee") {
        sql = "SELECT email, is_email_verified FROM employee WHERE emp_id = ? FOR UPDATE";
      } else {
        await db.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid userType" });
      }

      const queryResult = await db.query(sql, [numericId]);
      if (!Array.isArray(queryResult) || queryResult.length < 1) {
        await db.query("ROLLBACK");
        return res.status(500).json({ error: "Unexpected query result format" });
      }

      const rows = queryResult[0];
      if (!rows || (Array.isArray(rows) && rows.length === 0)) {
        await db.query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }

      const user = Array.isArray(rows) ? rows[0] : rows;
      if (!user || !user.email) {
        await db.query("ROLLBACK");
        return res.status(404).json({ error: "Email not found for user" });
      }

      if (user.is_email_verified) {
        await db.query("ROLLBACK");
        return res.status(400).json({ error: "Email is already verified" });
      }

      const email = user.email;
      const token = await db.generateVerificationToken(numericId, userType);
      await sendVerificationEmail(email, userId, userType, token);

      await db.query("COMMIT");
      res.json({ message: "Verification email resent successfully" });
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("Error resending verification email:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Register a complaint
app.post("/raisingcomplaint", async (req, res) => {
  const { desc, blockno, roomno } = req.body;
  const values = [desc, blockno, roomno];
  try {
    const result = await db.registercomplaint(values);
    if (result.affectedRows === 0) {
      return res.status(404).send("No matching block and room found");
    }
    res.send(result);
  } catch (err) {
    console.error("Erreur lors de l'enregistrement de la plainte:", err);
    res.status(500).json({ error: "Erreur serveur lors de l'enregistrement de la plainte" });
  }
});

// Create a tenant
app.post("/createtenant", async (req, res) => {
  console.log("Request body:", req.body);
  const { name, age, roomno, password, dob, ID, stat, leaveDate, email } = req.body;

  if (!name || !roomno || !password || !dob || !ID || !stat || !age || !email) {
    return res.status(400).send("Missing required fields, including email");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    const owners = await db.getdata("owner");
    const owner = owners.find((o) => String(o.room_no) === String(roomno));
    console.log("Found owner for roomno", roomno, ":", owner);
    if (!owner) {
      console.log(`No owner found for roomno: ${roomno}`);
      return res.status(400).send(`No owner found for room number ${roomno}`);
    }
    const ownerno = owner.owner_id;

    await db.query("START TRANSACTION");

    const tenantValues = [name, dob, stat, leaveDate, roomno, age, ownerno, password];
    console.log("Tenant values to insert:", tenantValues);
    const result = await db.createtenant(tenantValues);
    const insertedTenantId = result.insertId;

    const updateSql = "UPDATE tenant SET email = ?, is_email_verified = FALSE WHERE tenant_id = ?";
    await db.query(updateSql, [email, insertedTenantId]);

    const authSql = "INSERT INTO auth_tenant (id, password) VALUES (?, ?)";
    await db.query(authSql, [insertedTenantId, password]);

    const token = await db.generateVerificationToken(insertedTenantId, "tenant");
    await sendVerificationEmail(email, `t-${insertedTenantId}`, "tenant", token);

    const proofValues = [ID, insertedTenantId];
    await db.createtenantproof(proofValues);

    await db.query("COMMIT");

    console.log(`New tenant created with tenant_id: ${insertedTenantId}, user_id: t-${insertedTenantId}`);
    res.status(200).json({
      message: "Tenant created successfully. Please verify your email.",
      tenant_id: insertedTenantId,
      user_id: `t-${insertedTenantId}`,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Erreur lors de la création du locataire:", err);
    res.status(500).send("Erreur serveur lors de la création du locataire: " + err.message);
  }
});

app.post("/createowner", async (req, res) => {
  console.log("Received request body:", req.body);
  
  const { name, email, age, roomno, password, aggrementStatus, dob } = req.body;

  // Validate required fields  
  if (!name || !email || !age || !roomno || !password || !aggrementStatus || !dob) {
    console.error("Validation Error: Missing required fields");
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate email format  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Validation Error: Invalid email address");
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    await db.query("START TRANSACTION");

    // Check for duplicate email  
    const checkEmailSql = "SELECT owner_id FROM owner WHERE email = ?";
    const emailCheck = await db.query(checkEmailSql, [email]);
    console.log("Email Check Result:", emailCheck);
    if (emailCheck.length > 0) {
      await db.query("ROLLBACK");
      console.error("Email already exists");
      return res.status(400).json({ error: "Email already exists" });
    }

    // Fetch available rooms  
    const rooms = await db.getAvailableRooms();
    console.log("Available Rooms from DB:", rooms);
    
    // Log the roomno and types for comparison  
    console.log("Comparing roomno:", roomno, "of type", typeof roomno);
    console.log("Available rooms for comparison:", rooms.map(room => ({ room_no: room, type: typeof room })));

    // Convert roomno to a number for comparison  
    if (!rooms.some((room) => room === Number(roomno))) {
      await db.query("ROLLBACK");
      console.error("Room number not available");
      return res.status(400).json({ error: "Room number not available" });
    }

    // Insert into owner table  
    const ownerSql = `
      INSERT INTO owner (name, email, age, room_no, aggrement_status, dob, is_email_verified)
      VALUES (?, ?, ?, ?, ?, ?, FALSE)
    `;
    const ownerResult = await db.query(ownerSql, [
      name,
      email,
      age,
      roomno,
      aggrementStatus,
      dob,
    ]);
    console.log("Owner Insert Result:", ownerResult);

    const newOwnerId = ownerResult.insertId;

    // Insert into auth_owner table  
    const authSql = "INSERT INTO auth_owner (id, password) VALUES (?, ?)";
    await db.query(authSql, [newOwnerId, password]);

    // Send verification email  
    const token = await db.generateVerificationToken(newOwnerId, "owner");
    await sendVerificationEmail(email, `o-${newOwnerId}`, "owner", token);

    await db.query("COMMIT");
    res.status(200).json({
      message: "Owner created successfully. Please verify your email.",
      userId: `o-${newOwnerId}`,
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Error creating owner:", error);
    res.status(500).json({ error: "Failed to create owner: " + error.message });
  }
});

// Fetch tenant details
app.get("/tenantdetails", async (req, res) => {
  try {
    const result = await db.getdata("tenant");
    res.send(result);
  } catch (err) {
    console.error("Erreur lors de la récupération des locataires:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch owner details
app.get("/ownerdetails", async (req, res) => {
  try {
    const result = await db.getdata("owner");
    res.send(result);
  } catch (err) {
    console.error("Erreur lors de la récupération des propriétaires:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch parking slots for a user
app.post("/viewparking", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }
  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    const result = await db.viewparking(`t-${numericId}`);
    res.send(result);
  } catch (err) {
    console.error("Erreur serveur in /viewparking:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch owner complaints
app.post("/ownercomplaints", async (req, res) => {
  const { userId } = req.body;
  console.log("Received /ownercomplaints request:", { userId });

  if (!userId) {
    console.log("Missing userId in request body");
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  if (typeof userId !== "string") {
    console.log("Invalid userId format: userId must be a string, received:", userId);
    return res.status(400).json({ error: "Invalid userId format: userId must be a string" });
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    if (isNaN(numericId)) {
      console.log("Invalid userId format: Could not parse numeric ID from userId:", userId);
      return res.status(400).json({ error: "User ID must be a valid number" });
    }

    const result = await db.ownercomplaints(numericId);
    console.log("Owner complaints result:", result);
    // Ensure result is an array
    const responseData = Array.isArray(result) ? result : [];
    res.send(responseData);
  } catch (err) {
    console.error("Erreur serveur in /ownercomplaints:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch all complaints
app.get("/viewcomplaints", async (req, res) => {
  try {
    const result = await db.viewcomplaints();
    res.send(result);
  } catch (err) {
    console.error("Erreur serveur in /viewcomplaints:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch owner room details
app.post("/ownerroomdetails", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }
  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    const result = await db.ownerroomdetails(`o-${numericId}`);
    res.send(result);
  } catch (err) {
    console.error("Erreur serveur in /ownerroomdetails:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Book a parking slot
app.post("/bookslot", async (req, res) => {
  const { roomNo, slotNo } = req.body;
  try {
    const checkSql = "SELECT parking_slot FROM room WHERE room_no = ?";
    const results = await db.query(checkSql, [roomNo]);
    if (results.length === 0) {
      return res.status(404).json({ error: "Chambre non trouvée" });
    }

    const sql = "UPDATE room SET parking_slot = ? WHERE room_no = ?";
    await db.query(sql, [slotNo, roomNo]);
    res.json({ message: "Place de parking réservée avec succès" });
  } catch (err) {
    console.error("Erreur serveur in /bookslot:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch owner tenant details
app.post("/ownertenantdetails", async (req, res) => {
  const { userId } = req.body;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Received /ownertenantdetails request:`, { userId });

  if (!userId) {
    console.log(`[${timestamp}] Missing userId in request body`);
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    console.log(`[${timestamp}] Parsed numericId:`, numericId);

    const query = `
      SELECT tenant_id, name, dob, stat, room_no, age 
      FROM tenant 
      WHERE room_no IN (
        SELECT room_no 
        FROM owner 
        WHERE owner_id IN (
          SELECT id 
          FROM auth_owner 
          WHERE id = ?
        )
      )
    `;
    console.log(`[${timestamp}] Executing query:`, query, "with params:", [numericId]);

    // Execute the query directly
    const result = await db.query(query, [numericId]);
    console.log(`[${timestamp}] Raw query result:`, result);

    // Normalize the result to always be an array of tenant objects
    let responseData = Array.isArray(result) ? result : [];
    if (!Array.isArray(result) && result && typeof result === "object") {
      responseData = [result];
    }

    console.log(`[${timestamp}] Returning results:`, responseData);
    res.status(200).json(responseData);
    res.end();
  } catch (err) {
    console.error(`[${timestamp}] Erreur serveur in /ownertenantdetails:`, err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
    res.end();
  }
});
// Pay maintenance
app.post("/paymaintanance", async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing id in request body" });
  }
  try {
    await db.paymaintanence(id);
    const numericId = parseInt(id.split("-")[1] || id);
    const activitySql = "INSERT INTO activities (user_id, action, date) VALUES (?, ?, NOW())";
    await db.query(activitySql, [numericId, "Maintenance payé"]);
    res.sendStatus(200);
  } catch (err) {
    console.error("Erreur serveur in /paymaintanance:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

app.post("/deletetenant", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }
  try {
    // Convertir userId en string avant split
    const userIdStr = String(userId);
    const numericId = parseInt(userIdStr.split("-")[1] || userIdStr);

    if (isNaN(numericId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }

    await db.deletetenant(numericId);
    res.sendStatus(200);
  } catch (err) {
    console.error("Erreur serveur in /deletetenant:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

app.put("/updatemaintenancerequest/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const whom = JSON.parse(req.headers["whom"])?.userType;

  if (!["admin", "owner", "employee"].includes(whom)) {
    return res.status(403).json({ error: "Seuls les administrateurs, propriétaires ou employés peuvent mettre à jour les demandes de maintenance." });
  }

  if (!["pending", "in_progress", "resolved"].includes(status)) {
    return res.status(400).json({ error: "Statut invalide. Les valeurs autorisées sont : 'pending', 'in_progress', 'resolved'." });
  }

  try {
    const sql = "UPDATE maintenance_requests SET status = ? WHERE id = ?";
    const result = await db.query(sql, [status, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Demande de maintenance non trouvée." });
    }
    res.json({ message: "Statut de la demande mis à jour avec succès." });
  } catch (err) {
    console.error("Erreur serveur in /updatemaintenancerequest:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});
// Delete owner
app.post("/deleteowner", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }
  try {
    const userIdStr = String(userId); // Convertir en string
    const numericId = parseInt(userIdStr.split("-")[1] || userIdStr);

    if (isNaN(numericId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }

    await db.deleteowner(numericId);
    res.sendStatus(200);
  } catch (err) {
    console.error("Erreur serveur in /deleteowner:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});


// Delete employee
app.post("/deletemployee", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }
  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    await db.deleteemployee(numericId);
    res.sendStatus(200);
  } catch (err) {
    console.error("Erreur serveur in /deletemployee:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Delete complaint
app.post("/deletecomplaint", async (req, res) => {
  const { room_no } = req.body;
  if (!room_no) {
    return res.status(400).json({ error: "Missing room_no in request body" });
  }
  try {
    await db.deletecomplaint(room_no);
    res.json({ message: "Complaint resolved successfully" });
  } catch (err) {
    console.error("Erreur serveur in /deletecomplaint:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch recent activities
app.post("/recentactivities", async (req, res) => {
  try {
    const { userId, userType } = req.body;
    console.log("Received /recentactivities request:", { userId, userType });

    if (!userId || !userType) {
      console.log("Validation failed: Missing userId or userType");
      return res.status(400).json({ error: "Missing userId or userType in request body" });
    }

    const numericId = parseInt(userId.split("-")[1] || userId);
    if (isNaN(numericId)) {
      console.log("Validation failed: Invalid userId format:", userId);
      return res.status(400).json({ error: "Invalid userId format" });
    }

    let sql = "";
    const params = userType === "admin" ? [] : [numericId];
    if (userType === "tenant") {
      sql = "SELECT action, date FROM activities WHERE user_id = ? ORDER BY date DESC LIMIT 5";
    } else if (userType === "owner") {
      sql = "SELECT action, date FROM activities WHERE user_id = ? ORDER BY date DESC LIMIT 5";
    } else if (userType === "admin") {
      sql = "SELECT action, date FROM activities ORDER BY date DESC LIMIT 5";
    } else {
      console.log("Validation failed: Invalid userType:", userType);
      return res.status(400).json({ error: "Invalid userType. Must be 'tenant', 'owner', or 'admin'" });
    }

    const results = await db.query(sql, params);
    console.log("Recent activities result:", results);
    res.json(results);
  } catch (err) {
    console.error("Error fetching recent activities:", err);
    res.status(500).json({ error: "Error fetching recent activities: " + err.message });
  }
});

app.post("/notifications", async (req, res) => {
  try {
    const { userId, userType } = req.body;
    console.log("Received /notifications request:", { userId, userType });

    if (!userId || !userType) {
      console.log("Validation failed: Missing userId or userType");
      return res.status(400).json({ error: "Missing userId or userType in request body" });
    }

    const numericId = parseInt(userId.split("-")[1] || userId);
    if (isNaN(numericId)) {
      console.log("Validation failed: Invalid userId format:", userId);
      return res.status(400).json({ error: "Invalid userId format" });
    }

    let sql = "";
    const params = userType === "admin" ? [] : [numericId];
    if (userType === "tenant") {
      sql = "SELECT message, date FROM notifications WHERE user_id = ? ORDER BY date DESC LIMIT 5";
    } else if (userType === "owner") {
      sql = "SELECT message, date FROM notifications WHERE user_id = ? ORDER BY date DESC LIMIT 5";
    } else if (userType === "admin") {
      sql = "SELECT message, date FROM notifications ORDER BY date DESC LIMIT 5";
    } else if (userType === "employee") {
      sql = "SELECT message, date FROM notifications WHERE user_id = ? ORDER BY date DESC LIMIT 5";
    } else {
      console.log("Validation failed: Invalid userType:", userType);
      return res.status(400).json({ error: "Invalid userType. Must be 'tenant', 'owner', 'admin', or 'employee'" });
    }

    const results = await db.query(sql, params);
    console.log("Notifications result:", results);
    res.json(results);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Error fetching notifications: " + err.message });
  }
});

// Fetch stats history
app.get("/stats-history", async (req, res) => {
  try {
    const sql = "SELECT month, total_owners, total_tenants, total_employees FROM stats_history ORDER BY month ASC";
    const results = await db.query(sql, []);
    res.json(results);
  } catch (err) {
    console.error("Error fetching stats history:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch employee details
app.get("/employee", async (req, res) => {
  try {
    const result = await db.getdata("employee");
    res.send(result);
  } catch (err) {
    console.error("Erreur lors de la récupération des employés:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch weather data
app.get("/weather", async (req, res) => {
  console.log("Reached /weather endpoint with city:", req.query.city);
  const city = req.query.city || "Paris";
  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching weather data:", error.response?.data || error.message);
    if (error.response?.status === 404) {
      res.status(404).json({ error: "City not found", details: error.response.data.message });
    } else if (error.response?.status === 401) {
      res.status(401).json({ error: "Invalid API key", details: error.response.data.message });
    } else {
      res.status(500).json({ error: "Error fetching weather data", details: error.response?.data?.message || error.message });
    }
  }
});

// Fetch maintenance requests
app.post("/maintenancerequests", async (req, res) => {
  const { userId, userType, page, limit = 2, all } = req.body;
  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 2;
  const offset = (pageNum - 1) * pageSize;

  if (!userId || !userType) {
    return res.status(401).json({ error: "Utilisateur non connecté." });
  }

  try {
    // Validate userId format
    const numericId = parseInt(userId.split("-")[1] || userId);
    if (isNaN(numericId)) {
      return res.status(400).json({ error: "Format de userId invalide. Attendu : <type>-<id>" });
    }

    // Validate userType
    const validUserTypes = ["tenant", "owner", "admin", "employee"];
    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({ error: "Type d'utilisateur invalide. Types autorisés : tenant, owner, admin, employee" });
    }

    let sql;
    let params;
    if (userType === "tenant") {
      sql = `
        SELECT id, block_no, room_no, tenant_id, description, status, submitted_at
        FROM maintenance_requests
        WHERE tenant_id = ?
        ORDER BY submitted_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [numericId, pageSize, offset];
    } else {
      sql = `
        SELECT id, block_no, room_no, tenant_id, description, status, submitted_at
        FROM maintenance_requests
        WHERE room_no IN (
          SELECT room_no 
          FROM owner 
          WHERE owner_id IN (
            SELECT id 
            FROM auth_owner 
            WHERE id = ?
          )
        )
        ORDER BY submitted_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [numericId, pageSize, offset];
    }

    const requests = await db.query(sql, params);
    res.json(requests);
  } catch (err) {
    console.error("Erreur serveur in /maintenancerequests:", err);
    if (err.code === "ER_ACCESS_DENIED_ERROR") {
      res.status(500).json({ error: "Erreur de connexion à la base de données : Accès refusé. Vérifiez les identifiants de la base de données." });
    } else if (err.code === "ECONNREFUSED") {
      res.status(500).json({ error: "Erreur de connexion à la base de données : Connexion refusée. Assurez-vous que le serveur MySQL est en marche." });
    } else {
      res.status(500).json({ error: "Erreur serveur : " + err.message });
    }
  }
});


// Fetch system status
app.get("/systemstatus", async (req, res) => {
  try {
    const serverStartTime = process.uptime();
    const totalPossibleUptime = (Date.now() / 1000) - (new Date('2025-01-01').getTime() / 1000);
    const uptimePercentage = ((totalPossibleUptime - serverStartTime) / totalPossibleUptime) * 100;
    const uptime = Math.min(99.9, uptimePercentage).toFixed(1) + "%";

    const activeUsersSql = `
      SELECT COUNT(DISTINCT user_id) AS activeUsers
      FROM activities
      WHERE action = 'Connexion utilisateur'
      AND date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `;
    const activeUsersResult = await db.query(activeUsersSql, []);
    const activeUsers = activeUsersResult[0]?.activeUsers || 0;

    const alertsSql = `
      SELECT COUNT(*) AS alertCount 
      FROM system_alerts 
      WHERE resolved = FALSE 
      AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `;
    const alertsResult = await db.query(alertsSql, []);
    const alerts = alertsResult[0]?.alertCount || 0;

    res.json({
      uptime,
      activeUsers,
      alerts,
    });
  } catch (err) {
    console.error("Erreur serveur in /systemstatus:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch quick stats
app.get("/quickstats", async (req, res) => {
  try {
    const loginsTodaySql = `
      SELECT COUNT(*) AS totalLoginsToday
      FROM activities
      WHERE action = 'Connexion utilisateur'
      AND DATE(date) = CURDATE()
    `;
    const loginsTodayResult = await db.query(loginsTodaySql, []);
    const totalLoginsToday = loginsTodayResult[0]?.totalLoginsToday || 0;

    const complaintsSql = `
      SELECT COUNT(*) AS totalComplaintsFiled
      FROM block
      WHERE complaints IS NOT NULL
    `;
    const complaintsResult = await db.query(complaintsSql, []);
    const totalComplaintsFiled = complaintsResult[0]?.totalComplaintsFiled || 0;

    const pendingRequestsSql = `
      SELECT COUNT(*) AS pendingRequests
      FROM maintenance_requests
      WHERE status = 'pending'
    `;
    const pendingRequestsResult = await db.query(pendingRequestsSql, []);
    const pendingRequests = pendingRequestsResult[0]?.pendingRequests || 0;

    res.json({
      totalLoginsToday,
      totalComplaintsFiled,
      pendingRequests,
    });
  } catch (err) {
    console.error("Erreur serveur in /quickstats:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch system alerts
app.get("/systemalerts", async (req, res) => {
  try {
    const sql = `
      SELECT COUNT(*) AS alertCount 
      FROM system_alerts 
      WHERE resolved = FALSE 
      AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `;
    const [results] = await db.query(sql, []);
    res.json({ alerts: results[0].alertCount });
  } catch (err) {
    console.error("Erreur serveur in /systemalerts:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Submit maintenance request
app.post("/submitmaintenancerequest", async (req, res) => {
  const { userId, userType, room_no, description } = req.body;
  console.log("Received /submitmaintenancerequest request:", { userId, userType, room_no, description });

  if (!userId || !userType || !room_no || !description) {
    console.log("Validation failed: Missing required fields");
    return res.status(400).json({ error: "Missing required fields: userId, userType, room_no, description" });
  }

  const numericId = parseInt(userId.split("-")[1] || userId);
  const sql = "INSERT INTO maintenance_requests (user_id, user_type, room_no, description, status, submitted_at) VALUES (?, ?, ?, ?, 'pending', NOW())";
  try {
    const result = await db.query(sql, [numericId, userType, room_no, description]);
    res.json({ message: "Maintenance request submitted successfully", requestId: result.insertId });
  } catch (err) {
    console.error("Erreur serveur in /submitmaintenancerequest:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

app.post("/pendingtasks", async (req, res) => {
  const { userId } = req.body;
  console.log("Received /pendingtasks request:", { userId });

  if (!userId) {
    console.log("Missing userId in request body");
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  const numericId = parseInt(userId.split("-")[1] || userId);
  try {
    const employeeSql = "SELECT block_no FROM employee WHERE emp_id = ?";
    const employeeResult = await db.query(employeeSql, [numericId]);
    if (!employeeResult || employeeResult.length === 0) {
      console.log("Employee not found for emp_id:", numericId);
      return res.status(404).json({ error: "Employee not found for emp_id: " + numericId });
    }

    const blockNo = employeeResult[0].block_no;

    const sql = `
      SELECT mr.id, mr.room_no, mr.description, mr.status, mr.submitted_at
      FROM maintenance_requests mr
      JOIN block b ON mr.room_no = b.room_no
      WHERE b.block_no = ? AND mr.status IN ('pending', 'in_progress')
      ORDER BY mr.submitted_at DESC
    `;
    const results = await db.query(sql, [blockNo]);
    console.log("Pending tasks query result:", results);
    res.json(results);
  } catch (err) {
    console.error("Error fetching pending tasks:", err);
    res.status(500).json({ error: "Error fetching pending tasks: " + err.message });
  }
});

// Update user profile
app.put("/updateprofile/:userType", async (req, res) => {
  const { userId, block_no, email, phone, password, name, room_no, age, dob } = req.body;
  let { userType } = req.params;

  userType = userType.toLowerCase();
  console.log(`Received userType: ${userType}`);

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    console.log(`Updating profile for userType: ${userType}, userId: ${userId}, numericId: ${numericId}`);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Adresse e-mail invalide." });
    }

    if (userType === "admin") {
      if (!block_no || !/^\d+$/.test(block_no) || parseInt(block_no) <= 0) {
        return res.status(400).json({ error: "Le numéro de bloc doit être un entier positif." });
      }

      if (phone) {
        const phoneRegex = /^((\+33[67])|(0[67]))\d{8}$/;
        if (!phoneRegex.test(phone)) {
          return res.status(400).json({
            error: "Le numéro de téléphone doit commencer par +336, +337, 06, ou 07 et être suivi de 8 chiffres.",
          });
        }
      }

      if (password && password.length < 6) {
        return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
      }

      const sql = "UPDATE block_admin SET block_no = ?, email = ?, phone = ?, is_email_verified = FALSE WHERE admin_id = ?";
      const result = await db.query(sql, [block_no, email, phone, numericId]);
      const affectedRows = Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows;

      if (!affectedRows) return res.status(404).json({ error: "Administrateur non trouvé." });

      if (email) {
        const token = await db.generateVerificationToken(numericId, "admin");
        await sendVerificationEmail(email, userId, "admin", token);
      }

      if (password) {
        const authResult = await db.query("UPDATE auth_admin SET password = ? WHERE id = ?", [password, numericId]);
        const authAffectedRows = Array.isArray(authResult) ? authResult[0]?.affectedRows : authResult?.affectedRows;
        if (!authAffectedRows) return res.status(404).json({ error: "Utilisateur non trouvé dans auth_admin." });
      }

      return res.json({ message: "Profil mis à jour avec succès. Veuillez vérifier votre nouvelle adresse e-mail si elle a été modifiée." });
    } else if (userType === "tenant") {
      const result = await db.query(
        "UPDATE tenant SET name = ?, room_no = ?, age = ?, dob = ?, email = ?, is_email_verified = FALSE WHERE tenant_id = ?",
        [name, room_no, age, dob, email, numericId]
      );
      const affectedRows = Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows;

      if (!affectedRows) return res.status(404).json({ error: "Locataire non trouvé." });

      if (email) {
        const token = await db.generateVerificationToken(numericId, "tenant");
        await sendVerificationEmail(email, userId, "tenant", token);
      }

      if (password) {
        const authResult = await db.query("UPDATE auth_tenant SET password = ? WHERE id = ?", [password, numericId]);
        const authAffectedRows = Array.isArray(authResult) ? authResult[0]?.affectedRows : authResult?.affectedRows;
        if (!authAffectedRows) return res.status(404).json({ error: "Utilisateur non trouvé dans auth_tenant." });
      }

      return res.json({ message: "Profil mis à jour avec succès. Veuillez vérifier votre nouvelle adresse e-mail si elle a été modifiée." });
    } else if (userType === "owner") {
      const result = await db.query(
        "UPDATE owner SET name = ?, email = ?, is_email_verified = FALSE WHERE owner_id = ?",
        [name, email, numericId]
      );
      const affectedRows = Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows;

      if (!affectedRows) return res.status(404).json({ error: "Propriétaire non trouvé." });

      if (email) {
        const token = await db.generateVerificationToken(numericId, "owner");
        await sendVerificationEmail(email, userId, "owner", token);
      }

      if (password) {
        const authResult = await db.query("UPDATE auth_owner SET password = ? WHERE id = ?", [password, numericId]);
        const authAffectedRows = Array.isArray(authResult) ? authResult[0]?.affectedRows : authResult?.affectedRows;
        if (!authAffectedRows) return res.status(404).json({ error: "Utilisateur non trouvé dans auth_owner." });
      }

      return res.json({ message: "Profil mis à jour avec succès. Veuillez vérifier votre nouvelle adresse e-mail si elle a été modifiée." });
    } else if (userType === "employee") {
      const result = await db.query(
        "UPDATE employee SET emp_name = ?, email = ?, block_no = ?, is_email_verified = FALSE WHERE emp_id = ?",
        [name, email, block_no, numericId]
      );
      const affectedRows = Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows;

      if (!affectedRows) return res.status(404).json({ error: "Employé non trouvé avec cet emp_id." });

      if (email) {
        const token = await db.generateVerificationToken(numericId, "employee");
        await sendVerificationEmail(email, userId, "employee", token);
      }

      if (password) {
        const authResult = await db.query("UPDATE auth_employee SET password = ? WHERE id = ?", [password, numericId]);
        const authAffectedRows = Array.isArray(authResult) ? authResult[0]?.affectedRows : authResult?.affectedRows;
        if (!authAffectedRows) return res.status(404).json({ error: "Utilisateur non trouvé dans auth_employee." });
      }

      return res.json({ message: "Profil mis à jour avec succès. Veuillez vérifier votre nouvelle adresse e-mail si elle a été modifiée." });
    } else {
      return res.status(400).json({ error: "Type d'utilisateur invalide." });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour du profil:", error);
    return res.status(500).json({ error: "Erreur lors de la mise à jour du profil: " + error.message });
  }
});

// Send message (for employee messaging)
app.post("/sendmessage", async (req, res) => {
  const { sender_id, sender_type, receiver_id, receiver_type, subject, message } = req.body;

  if (!sender_id || !sender_type || !receiver_id || !receiver_type || !subject || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const sql = "INSERT INTO messages (sender_id, sender_type, receiver_id, receiver_type, subject, message) VALUES (?, ?, ?, ?, ?, ?)";
    const result = await db.query(sql, [sender_id, sender_type, receiver_id, receiver_type, subject, message]);
    res.json({ message: "Message sent successfully", messageId: result.insertId });
  } catch (err) {
    console.error("Erreur serveur in /sendmessage:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

app.get("/usersformessaging", async (req, res) => {
  try {
    const adminsSql = "SELECT admin_id AS id, admin_name AS name, 'admin' AS type FROM block_admin";
    const ownersSql = "SELECT owner_id AS id, name, 'owner' AS type FROM owner";

    const adminsResult = await db.query(adminsSql);
    const ownersResult = await db.query(ownersSql);

    const admins = Array.isArray(adminsResult) ? adminsResult : [];
    const owners = Array.isArray(ownersResult) ? ownersResult : [];

    console.log("Admins after processing:", admins);
    console.log("Owners after processing:", owners);

    const users = [...admins, ...owners];
    res.json(users);
  } catch (err) {
    console.error("Erreur serveur in /usersformessaging:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch auth ID (no longer needed, but updated for consistency)
app.post("/get-auth-id", async (req, res) => {
  const { userId } = req.body;
  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    res.json({ id: numericId });
  } catch (error) {
    console.error("Erreur lors de la récupération de l'ID auth:", error);
    res.status(500).json({ error: "Erreur serveur: " + error.message });
  }
});

// Fetch block admin details
app.post("/block_admin", async (req, res) => {
  const { admin_id } = req.body;
  if (!admin_id) {
    return res.status(400).json({ error: "Missing admin_id in request body" });
  }

  try {
    const result = await db.getBlockAdmin(admin_id);
    if (!result) {
      return res.status(404).json({ error: "Admin not found" });
    }
    res.json(result);
  } catch (err) {
    console.error("Erreur serveur in /block_admin:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch block by room number
app.post("/block", async (req, res) => {
  const { room_no } = req.body;
  if (!room_no) {
    console.log("Missing room_no in /block request");
    return res.status(400).json({ error: "Missing room_no in request body" });
  }

  try {
    const result = await db.getBlockByRoomNo(room_no);
    if (!result) {
      console.log(`Block not found for room_no: ${room_no}`);
      return res.status(404).json({ error: "Block not found for the given room number" });
    }
    console.log(`Block found for room_no: ${room_no}`, result);
    res.json(result);
  } catch (err) {
    console.error("Error in /block endpoint:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch payment status
app.post("/paymentstatus", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    const result = await db.getPaymentStatus(numericId);
    if (!result) {
      return res.status(404).json({ error: "Payment status not found for userId: " + numericId });
    }
    // Map database status to user-friendly format
    const status = result.status === "Payé" ? "paid" : "overdue";
    const response = {
      status,
      amountDue: status === "overdue" ? 1000 : 0, // Example amount, adjust based on schema
      nextPaymentDate: result.dueDate || null,
    };
    res.json(response);
  } catch (err) {
    console.error("Error fetching payment status:", err);
    res.status(500).json({ error: "Error fetching payment status: " + err.message });
  }
});

app.get("/available-rooms", async (req, res) => {
  try {
    const availableRooms = await db.getAvailableRooms();

    if (!Array.isArray(availableRooms)) {
      console.error("Available rooms is not an array:", availableRooms);
      return res.status(500).json({ error: "Unexpected data format" });
    }

    console.log("Available Rooms:", availableRooms);
    res.status(200).json({ availableRooms });
  } catch (err) {
    console.error("Error in /available-rooms route:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Fetch available parking slots
app.get("/available-parking-slots", async (req, res) => {
  console.log("Handling request: GET /available-parking-slots");
  try {
    const availableSlots = await db.getAvailableParkingSlots();
    res.status(200).json(availableSlots);
  } catch (err) {
    console.error("Erreur lors de la récupération des places de parking disponibles:", err);
    res.status(500).json({ message: "Erreur serveur lors de la récupération des places de parking disponibles", error: err.message });
  }
});

// Fetch occupied rooms
app.get("/occupied-rooms", async (req, res) => {
  console.log("Handling request: GET /occupied-rooms");
  try {
    const occupiedRooms = await db.getOccupiedRooms();
    res.status(200).json(occupiedRooms);
  } catch (err) {
    console.error("Erreur lors de la récupération des chambres occupées:", err);
    res.status(500).json({ message: "Erreur serveur lors de la récupération des chambres occupées", error: err.message });
  }
});

// Fetch available blocks
app.get("/available-blocks", async (req, res) => {
  try {
    const sql = "SELECT block_no, block_name FROM block";
    const results = await db.query(sql, []);
    res.json(results);
  } catch (err) {
    console.error("Erreur serveur in /available-blocks:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch all users for management portal
app.get("/all-users", async (req, res) => {
  try {
    const adminsSql = "SELECT admin_id AS id, admin_name AS name, 'admin' AS type, email, is_email_verified FROM block_admin";
    const adminsResult = await db.query(adminsSql);
    console.log("Raw admins query result:", adminsResult);

    let admins;
    if (Array.isArray(adminsResult) && adminsResult.length > 0 && Array.isArray(adminsResult[0])) {
      admins = adminsResult[0];
    } else if (Array.isArray(adminsResult)) {
      admins = adminsResult;
    } else {
      console.error("Unexpected admins query result format:", adminsResult);
      throw new Error("Unexpected admins query result format");
    }
    console.log("Admins:", admins);

    const ownersSql = "SELECT owner_id AS id, name, 'owner' AS type, email, is_email_verified FROM owner";
    const ownersResult = await db.query(ownersSql);
    console.log("Raw owners query result:", ownersResult);

    let owners;
    if (Array.isArray(ownersResult) && ownersResult.length > 0 && Array.isArray(ownersResult[0])) {
      owners = ownersResult[0];
    } else if (Array.isArray(ownersResult)) {
      owners = ownersResult;
    } else {
      console.error("Unexpected owners query result format:", ownersResult);
      throw new Error("Unexpected owners query result format");
    }
    console.log("Owners:", owners);

    const tenantsSql = "SELECT tenant_id AS id, name, 'tenant' AS type, email, is_email_verified FROM tenant";
    const tenantsResult = await db.query(tenantsSql);
    console.log("Raw tenants query result:", tenantsResult);

    let tenants;
    if (Array.isArray(tenantsResult) && tenantsResult.length > 0 && Array.isArray(tenantsResult[0])) {
      tenants = tenantsResult[0];
    } else if (Array.isArray(tenantsResult)) {
      tenants = tenantsResult;
    } else {
      console.error("Unexpected tenants query result format:", tenantsResult);
      throw new Error("Unexpected tenants query result format");
    }
    console.log("Tenants:", tenants);

    const employeesSql = "SELECT emp_id AS id, emp_name AS name, 'employee' AS type, email, is_email_verified FROM employee";
    const employeesResult = await db.query(employeesSql);
    console.log("Raw employees query result:", employeesResult);

    let employees;
    if (Array.isArray(employeesResult) && employeesResult.length > 0 && Array.isArray(employeesResult[0])) {
      employees = employeesResult[0];
    } else if (Array.isArray(employeesResult)) {
      employees = employeesResult;
    } else {
      console.error("Unexpected employees query result format:", employeesResult);
      throw new Error("Unexpected employees query result format");
    }
    console.log("Employees:", employees);

    const users = [...(admins || []), ...(owners || []), ...(tenants || []), ...(employees || [])];
    res.status(200).json(users);
  } catch (err) {
    console.error("Erreur lors de la récupération des utilisateurs:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// Fetch analytics data for management portal
app.get("/analytics", async (req, res) => {
  try {
    const totalUsersSql = `
      SELECT 
        (SELECT COUNT(*) FROM block_admin) +
        (SELECT COUNT(*) FROM owner) +
        (SELECT COUNT(*) FROM tenant) +
        (SELECT COUNT(*) FROM employee) AS totalUsers
    `;
    const totalUsersResult = await db.query(totalUsersSql);

    const totalAdminsSql = "SELECT COUNT(*) AS totalAdmins FROM block_admin";
    const totalAdminsResult = await db.query(totalAdminsSql);

    const totalOwnersSql = "SELECT COUNT(*) AS totalOwners FROM owner";
    const totalOwnersResult = await db.query(totalOwnersSql);

    const totalTenantsSql = "SELECT COUNT(*) AS totalTenants FROM tenant";
    const totalTenantsResult = await db.query(totalTenantsSql);

    const totalEmployeesSql = "SELECT COUNT(*) AS totalEmployees FROM employee";
    const totalEmployeesResult = await db.query(totalEmployeesSql);

    const activeLeasesSql = "SELECT COUNT(*) AS activeLeases FROM tenant WHERE stat = 'active'";
    const activeLeasesResult = await db.query(activeLeasesSql);

    const pendingRequestsSql = "SELECT COUNT(*) AS pendingRequests FROM maintenance_requests WHERE status = 'pending'";
    const pendingRequestsResult = await db.query(pendingRequestsSql);

    res.json({
      totalUsers: totalUsersResult[0]?.totalUsers || 0,
      totalAdmins: totalAdminsResult[0]?.totalAdmins || 0,
      totalOwners: totalOwnersResult[0]?.totalOwners || 0,
      totalTenants: totalTenantsResult[0]?.totalTenants || 0,
      totalEmployees: totalEmployeesResult[0]?.totalEmployees || 0,
      activeLeases: activeLeasesResult[0]?.activeLeases || 0,
      pendingRequests: pendingRequestsResult[0]?.pendingRequests || 0,
    });
  } catch (err) {
    console.error("Erreur lors de la récupération des analyses:", err);
    res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});
// Fetch tenant overview for owners
// In index.js
app.post("/tenantoverview", async (req, res) => {
  const { userId } = req.body;
  console.log("Received /tenantoverview request:", { userId });

  if (!userId) {
    console.log("Missing userId in request body");
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  try {
    const numericId = parseInt(userId.split("-")[1] || userId);
    if (isNaN(numericId)) {
      console.log("Invalid userId format:", userId);
      return res.status(400).json({ error: "Invalid userId format" });
    }

    const sqlTotalTenants = `
      SELECT COUNT(*) AS totalTenants
      FROM tenant
      WHERE ownerno = ?
    `;
    const totalTenantsResult = await db.query(sqlTotalTenants, [numericId]);
    console.log("Total tenants query executed for ownerno:", numericId, "Result:", totalTenantsResult);

    const sqlActiveLeases = `
      SELECT COUNT(*) AS activeLeases
      FROM tenant
      WHERE ownerno = ? AND stat = 'Payé'
    `;
    const activeLeasesResult = await db.query(sqlActiveLeases, [numericId]);
    console.log("Active leases query executed for ownerno:", numericId, "Result:", activeLeasesResult);

    // Safely access totalTenants and activeLeases
    const totalTenants = totalTenantsResult && totalTenantsResult[0] && typeof totalTenantsResult[0].totalTenants === 'number'
      ? totalTenantsResult[0].totalTenants
      : 0;
    const activeLeases = activeLeasesResult && activeLeasesResult[0] && typeof activeLeasesResult[0].activeLeases === 'number'
      ? activeLeasesResult[0].activeLeases
      : 0;

    res.json({
      totalTenants,
      activeLeases,
    });
  } catch (err) {
    console.error("Error fetching tenant overview:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Error fetching tenant overview: " + err.message });
  }
});
// Delete a user
app.delete("/delete-user", async (req, res) => {
  const { userId, userType } = req.body;

  if (!userId || !userType) {
    return res.status(400).json({ error: "User ID and type are required" });
  }

  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ error: "User ID must be a valid positive integer" });
  }

  const numericUserId = parseInt(userId, 10);

  const validUserTypes = ["admin", "owner", "tenant", "employee"];
  if (!validUserTypes.includes(userType)) {
    return res.status(400).json({ error: "Invalid userType" });
  }

  try {
    await db.query("START TRANSACTION");

    const tableMap = {
      admin: { table: "block_admin", column: "admin_id", authTable: "auth_admin" },
      owner: { table: "owner", column: "owner_id", authTable: "auth_owner" },
      tenant: { table: "tenant", column: "tenant_id", authTable: "auth_tenant" },
      employee: { table: "employee", column: "emp_id", authTable: "auth_employee" },
    };

    const { table, column, authTable } = tableMap[userType];

    const sql = `DELETE FROM ${table} WHERE ${column} = ?`;
    const userResult = await db.query(sql, [numericUserId]);
    const userAffectedRows = userResult[0]?.affectedRows || userResult.affectedRows || 0;

    if (userAffectedRows === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    await db.query("COMMIT");
    console.log(`Deleted user: type=${userType}, userId=${numericUserId}`);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Erreur lors de la suppression de l'utilisateur:", error);
    res.status(500).json({ error: `Erreur serveur: ${error.message}` });
  }
});

// Catch-all route for undefined endpoints
app.get("*", function (req, res) {
  res.status(404).json({ error: `Route not found: ${req.originalUrl}` });
});

// Start the server
try {
  app.listen(port, () => {
    console.log("Server started to listen...");
  });
} catch (err) {
  console.error("Error starting server:", err);
  process.exit(1);
}