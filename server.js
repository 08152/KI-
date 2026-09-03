const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/*
  --------------------------------------------------
  GHOSTGRAM SERVER
  --------------------------------------------------

  Die Browser speichern einen lokalen Cache.

  Der Server bleibt die zentrale Quelle:
  - Benutzer
  - Login-Sessions
  - Posts
  - Likes
  - Kommentare

  Hinweis:
  Dieser Server nutzt RAM-Speicher.
  Nach einem Neustart werden die Daten gelöscht.

  Für eine dauerhaft gespeicherte Version auf Render
  sollte später PostgreSQL verwendet werden.
*/

const users = new Map();
const sessions = new Map();
const posts = new Map();

/*
  Uploads werden zunächst im RAM gehalten.
  Maximal 100 MB pro Datei.
*/

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 100 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowed =
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/");

    if (!allowed) {
      return cb(
        new Error("Nur Bilder und Videos sind erlaubt.")
      );
    }

    cb(null, true);
  }
});

/*
  --------------------------------------------------
  HILFSFUNKTIONEN
  --------------------------------------------------
*/

function hashPin(pin) {

  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");

}

function createId() {

  return crypto.randomUUID();

}

function createToken() {

  return crypto.randomBytes(48).toString("hex");

}

function cleanUsername(username) {

  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 30);

}

function cleanEmail(email) {

  return String(email || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);

}

function getToken(req) {

  const header =
    req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.substring(7).trim();

}

function getCurrentUser(req) {

  const token = getToken(req);

  if (!token) {
    return null;
  }

  const userId = sessions.get(token);

  if (!userId) {
    return null;
  }

  return users.get(userId) || null;

}

function requireAuth(req, res, next) {

  const user = getCurrentUser(req);

  if (!user) {

    return res.status(401).json({
      error: "Nicht angemeldet."
    });

  }

  req.user = user;

  next();

}

function publicUser(user) {

  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    online: user.online,
    createdAt: user.createdAt
  };

}

function publicPost(post) {

  return {
    id: post.id,

    userId: post.userId,

    username: post.username,

    avatar: post.avatar,

    type: post.type,

    media: post.media,

    caption: post.caption,

    likes: [...post.likes],

    comments: post.comments.map(comment => ({
      id: comment.id,
      userId: comment.userId,
      username: comment.username,
      text: comment.text,
      createdAt: comment.createdAt
    })),

    createdAt: post.createdAt
  };

}

/*
  --------------------------------------------------
  REGISTER
  --------------------------------------------------
*/

app.post("/api/register", (req, res) => {

  const username =
    cleanUsername(req.body.username);

  const email =
    cleanEmail(req.body.email);

  const pin =
    String(req.body.pin || "");

  if (!username || !email || !pin) {

    return res.status(400).json({
      error:
        "Benutzername, E-Mail und PIN werden benötigt."
    });

  }

  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {

    return res.status(400).json({
      error:
        "Der Benutzername muss 3–30 Zeichen lang sein."
    });

  }

  if (!/^\d{4,8}$/.test(pin)) {

    return res.status(400).json({
      error:
        "Die PIN muss aus 4–8 Ziffern bestehen."
    });

  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

    return res.status(400).json({
      error:
        "Ungültige E-Mail-Adresse."
    });

  }

  for (const user of users.values()) {

    if (user.email === email) {

      return res.status(409).json({
        error:
          "Diese E-Mail ist bereits registriert."
      });

    }

    if (user.username === username) {

      return res.status(409).json({
        error:
          "Dieser Benutzername ist bereits vergeben."
      });

    }

  }

  const id = createId();

  const user = {

    id,

    username,

    email,

    pinHash: hashPin(pin),

    avatar:
      "https://api.dicebear.com/9.x/initials/svg?seed=" +
      encodeURIComponent(username),

    online: true,

    createdAt:
      new Date().toISOString()

  };

  users.set(id, user);

  const token = createToken();

  sessions.set(token, id);

  res.json({

    token,

    user:
      publicUser(user)

  });

});

/*
  --------------------------------------------------
  LOGIN
  --------------------------------------------------
*/

app.post("/api/login", (req, res) => {

  const email =
    cleanEmail(req.body.email);

  const pin =
    String(req.body.pin || "");

  let found = null;

  for (const user of users.values()) {

    if (user.email === email) {

      found = user;
      break;

    }

  }

  if (
    !found ||
    found.pinHash !== hashPin(pin)
  ) {

    return res.status(401).json({
      error:
        "E-Mail oder PIN ist falsch."
    });

  }

  found.online = true;

  const token = createToken();

  sessions.set(
    token,
    found.id
  );

  res.json({

    token,

    user:
      publicUser(found)

  });

});

/*
  --------------------------------------------------
  LOGOUT
  --------------------------------------------------
*/

app.post(
  "/api/logout",
  requireAuth,
  (req, res) => {

    const token =
      getToken(req);

    sessions.delete(token);

    req.user.online = false;

    res.json({
      success: true
    });

  }
);

/*
  --------------------------------------------------
  ME
  --------------------------------------------------
*/

app.get(
  "/api/me",
  requireAuth,
  (req, res) => {

    res.json(
      publicUser(req.user)
    );

  }
);

/*
  --------------------------------------------------
  ONLINE USERS
  --------------------------------------------------
*/

app.get(
  "/api/users",
  requireAuth,
  (req, res) => {

    const result = [];

    for (const user of users.values()) {

      if (
        user.id === req.user.id
      ) {
        continue;
      }

      /*
        Nur wirklich registrierte
        und aktuell eingeloggte Nutzer.
      */

      if (!user.online) {
        continue;
      }

      result.push(
        publicUser(user)
      );

    }

    res.json(result);

  }
);

/*
  --------------------------------------------------
  PEOPLE YOU MAY KNOW
  --------------------------------------------------

  Aktuell werden nur echte registrierte
  Nutzer angezeigt.

  Später kann hier ein echtes
  Empfehlungssystem hinzukommen.
*/

app.get(
  "/api/people",
  requireAuth,
  (req, res) => {

    const people = [];

    for (const user of users.values()) {

      if (
        user.id === req.user.id
      ) {
        continue;
      }

      if (!user.online) {
        continue;
      }

      people.push(
        publicUser(user)
      );

    }

    res.json(people);

  }
);

/*
  --------------------------------------------------
  FEED
  --------------------------------------------------
*/

app.get(
  "/api/feed",
  requireAuth,
  (req, res) => {

    const result = [];

    for (const post of posts.values()) {

      const author =
        users.get(post.userId);

      /*
        Beiträge von nicht mehr
        eingeloggten Nutzern werden
        nicht im normalen Feed gezeigt.
      */

      if (!author || !author.online) {
        continue;
      }

      result.push(
        publicPost(post)
      );

    }

    result.sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );

    res.json({

      syncedAt:
        new Date().toISOString(),

      posts: result

    });

  }
);

/*
  --------------------------------------------------
  POST ERSTELLEN
  --------------------------------------------------
*/

app.post(
  "/api/posts",
  requireAuth,
  upload.single("media"),
  (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        error:
          "Bitte ein Bild oder Video auswählen."
      });

    }

    const isImage =
      req.file.mimetype.startsWith("image/");

    const isVideo =
      req.file.mimetype.startsWith("video/");

    if (!isImage && !isVideo) {

      return res.status(400).json({
        error:
          "Dateityp wird nicht unterstützt."
      });

    }

    const id =
      createId();

    const media =
      "data:" +
      req.file.mimetype +
      ";base64," +
      req.file.buffer.toString("base64");

    const post = {

      id,

      userId:
        req.user.id,

      username:
        req.user.username,

      avatar:
        req.user.avatar,

      type:
        isVideo
          ? "video"
          : "image",

      media,

      caption:
        String(req.body.caption || "")
          .slice(0, 2000),

      likes: [],

      comments: [],

      createdAt:
        new Date().toISOString()

    };

    posts.set(
      id,
      post
    );

    res.json({

      success: true,

      post:
        publicPost(post)

    });

  }
);

/*
  --------------------------------------------------
  LIKE
  --------------------------------------------------
*/

app.post(
  "/api/posts/:id/like",
  requireAuth,
  (req, res) => {

    const post =
      posts.get(req.params.id);

    if (!post) {

      return res.status(404).json({
        error:
          "Post nicht gefunden."
      });

    }

    const index =
      post.likes.indexOf(
        req.user.id
      );

    let liked;

    if (index === -1) {

      post.likes.push(
        req.user.id
      );

      liked = true;

    } else {

      post.likes.splice(
        index,
        1
      );

      liked = false;

    }

    res.json({

      liked,

      likes:
        post.likes.length

    });

  }
);

/*
  --------------------------------------------------
  COMMENT
  --------------------------------------------------
*/

app.post(
  "/api/posts/:id/comments",
  requireAuth,
  (req, res) => {

    const post =
      posts.get(req.params.id);

    if (!post) {

      return res.status(404).json({
        error:
          "Post nicht gefunden."
      });

    }

    const text =
      String(req.body.text || "")
        .trim()
        .slice(0, 500);

    if (!text) {

      return res.status(400).json({
        error:
          "Kommentar darf nicht leer sein."
      });

    }

    const comment = {

      id:
        createId(),

      userId:
        req.user.id,

      username:
        req.user.username,

      text,

      createdAt:
        new Date().toISOString()

    };

    post.comments.push(
      comment
    );

    res.json({
      success: true,
      comment
    });

  }
);

/*
  --------------------------------------------------
  POST LÖSCHEN
  --------------------------------------------------
*/

app.delete(
  "/api/posts/:id",
  requireAuth,
  (req, res) => {

    const post =
      posts.get(req.params.id);

    if (!post) {

      return res.status(404).json({
        error:
          "Post nicht gefunden."
      });

    }

    if (
      post.userId !==
      req.user.id
    ) {

      return res.status(403).json({
        error:
          "Du kannst nur deine eigenen Posts löschen."
      });

    }

    posts.delete(
      req.params.id
    );

    res.json({
      success: true
    });

  }
);

/*
  --------------------------------------------------
  SYNC
  --------------------------------------------------

  Der Browser kann beim Start
  seinen lokalen Cache an den Server
  melden.

  Der Server antwortet mit dem
  aktuellen Stand.

  Wichtig:
  Der Server übernimmt dabei nicht
  blind Daten aus dem Browser.
*/

app.get(
  "/api/sync",
  requireAuth,
  (req, res) => {

    const onlineUsers = [];

    for (const user of users.values()) {

      if (
        user.id !== req.user.id &&
        user.online
      ) {

        onlineUsers.push(
          publicUser(user)
        );

      }

    }

    const feed = [];

    for (const post of posts.values()) {

      const author =
        users.get(post.userId);

      if (
        author &&
        author.online
      ) {

        feed.push(
          publicPost(post)
        );

      }

    }

    feed.sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );

    res.json({

      serverTime:
        new Date().toISOString(),

      currentUser:
        publicUser(req.user),

      users:
        onlineUsers,

      posts:
        feed

    });

  }
);

/*
  --------------------------------------------------
  HEALTH CHECK
  --------------------------------------------------
*/

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      online: true,

      users:
        users.size,

      posts:
        posts.size,

      time:
        new Date().toISOString()

    });

  }
);

/*
  --------------------------------------------------
  FEHLERBEHANDLUNG
  --------------------------------------------------
*/

app.use(
  (err, req, res, next) => {

    console.error(err);

    if (
      err instanceof multer.MulterError
    ) {

      if (
        err.code === "LIMIT_FILE_SIZE"
      ) {

        return res.status(413).json({
          error:
            "Die Datei ist zu groß. Maximal 100 MB."
        });

      }

    }

    res.status(500).json({
      error:
        err.message ||
        "Interner Serverfehler."
    });

  }
);

/*
  --------------------------------------------------
  INDEX.HTML
  --------------------------------------------------
*/

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      __dirname + "/index.html"
    );

  }
);

/*
  --------------------------------------------------
  START
  --------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Ghostgram läuft auf Port ${PORT}`
    );

  }
);
