// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      users: [
        {
          id: 1,
          username: "ghostface",
          name: "Ghostface",
          bio: "Willkommen bei Ghostgram 👻",
          avatar: "https://i.pravatar.cc/150?img=12"
        },
        {
          id: 2,
          username: "alex",
          name: "Alex",
          bio: "Fotos & Abenteuer 📸",
          avatar: "https://i.pravatar.cc/150?img=32"
        }
      ],
      posts: [
        {
          id: 1,
          userId: 1,
          image: "https://picsum.photos/id/1015/900/900",
          caption: "Willkommen bei Ghostgram! 👻",
          likes: [],
          comments: [],
          createdAt: new Date().toISOString()
        },
        {
          id: 2,
          userId: 2,
          image: "https://picsum.photos/id/1016/900/900",
          caption: "Ein schöner Tag 🌄",
          likes: [],
          comments: [],
          createdAt: new Date(Date.now() - 3600000).toISOString()
        }
      ]
    }, null, 2)
  );
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function formatPost(post, data) {
  const user = data.users.find(u => u.id === post.userId);

  return {
    ...post,
    user,
    likesCount: post.likes.length,
    comments: post.comments.map(c => ({
      ...c,
      user: data.users.find(u => u.id === c.userId)
    }))
  };
}

app.get("/api/feed", (req, res) => {
  const data = loadData();

  const posts = [...data.posts]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(post => formatPost(post, data));

  res.json(posts);
});

app.get("/api/users", (req, res) => {
  const data = loadData();
  res.json(data.users);
});

app.get("/api/users/:username", (req, res) => {
  const data = loadData();

  const user = data.users.find(
    u => u.username.toLowerCase() === req.params.username.toLowerCase()
  );

  if (!user) {
    return res.status(404).json({ error: "User nicht gefunden" });
  }

  const posts = data.posts
    .filter(p => p.userId === user.id)
    .map(p => formatPost(p, data));

  res.json({
    user,
    posts
  });
});

app.post("/api/users", (req, res) => {
  const data = loadData();

  const username = String(req.body.username || "")
    .trim()
    .toLowerCase();

  const name = String(req.body.name || "").trim();

  if (!username || !name) {
    return res.status(400).json({
      error: "Username und Name erforderlich"
    });
  }

  if (data.users.some(u => u.username === username)) {
    return res.status(409).json({
      error: "Username bereits vorhanden"
    });
  }

  const user = {
    id: Date.now(),
    username,
    name,
    bio: "",
    avatar: `https://i.pravatar.cc/150?u=${username}`
  };

  data.users.push(user);
  saveData(data);

  res.json(user);
});

app.post("/api/posts", (req, res) => {
  const data = loadData();

  const userId = Number(req.body.userId) || 1;
  const image = String(req.body.image || "").trim();
  const caption = String(req.body.caption || "").trim();

  if (!image) {
    return res.status(400).json({
      error: "Bild-URL erforderlich"
    });
  }

  const user = data.users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({
      error: "User nicht gefunden"
    });
  }

  const post = {
    id: Date.now(),
    userId,
    image,
    caption,
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };

  data.posts.unshift(post);
  saveData(data);

  res.json(formatPost(post, data));
});

app.delete("/api/posts/:id", (req, res) => {
  const data = loadData();

  const id = Number(req.params.id);
  const index = data.posts.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({
      error: "Post nicht gefunden"
    });
  }

  data.posts.splice(index, 1);
  saveData(data);

  res.json({
    success: true
  });
});

app.post("/api/posts/:id/like", (req, res) => {
  const data = loadData();

  const post = data.posts.find(
    p => p.id === Number(req.params.id)
  );

  if (!post) {
    return res.status(404).json({
      error: "Post nicht gefunden"
    });
  }

  const userId = Number(req.body.userId) || 1;
  const index = post.likes.indexOf(userId);

  if (index === -1) {
    post.likes.push(userId);
  } else {
    post.likes.splice(index, 1);
  }

  saveData(data);

  res.json({
    liked: post.likes.includes(userId),
    likesCount: post.likes.length
  });
});

app.post("/api/posts/:id/comments", (req, res) => {
  const data = loadData();

  const post = data.posts.find(
    p => p.id === Number(req.params.id)
  );

  if (!post) {
    return res.status(404).json({
      error: "Post nicht gefunden"
    });
  }

  const text = String(req.body.text || "").trim();

  if (!text) {
    return res.status(400).json({
      error: "Kommentar darf nicht leer sein"
    });
  }

  const comment = {
    id: Date.now(),
    userId: Number(req.body.userId) || 1,
    text,
    createdAt: new Date().toISOString()
  };

  post.comments.push(comment);
  saveData(data);

  res.json({
    ...comment,
    user: data.users.find(u => u.id === comment.userId)
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Ghostgram läuft auf Port ${PORT}`);
});
