require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// --- Validate required environment variables ---
const REQUIRED_ENV = ['ADMIN_PASSWORD', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`[FATAL] Missing required environment variable: ${key}`);
        process.exit(1);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PATH = process.env.ADMIN_PATH || '/admin.html';

// --- Middleware ---
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            frameSrc: ["'self'", "https://player.bilibili.com", "https://www.youtube.com", "https://www.bilibili.com"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
            "frame-ancestors": ["'self'"],
        }
    }
}));
app.use(cors({ origin: /https?:\/\/(.*\.)?jimplay\.cn$/ }));
app.use(express.json());

// --- Rate Limiter for login ---
const WHITELIST_IPS = (process.env.WHITELIST_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: 'Too many login attempts, please try again later',
    skip: (req) => {
        const clientIp = req.ip || req.connection.remoteAddress;
        return WHITELIST_IPS.some(ip => clientIp.includes(ip));
    }
});

// --- Helper Functions ---
const readDb = async () => {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        const db = JSON.parse(data);
        // Ensure all top-level keys exist to prevent crashes
        if (!db.tools) db.tools = [];
        if (!db.categories) db.categories = [];
        if (!db.settings) db.settings = {};
        return db;
    } catch (error) {
        if (error.code === 'ENOENT') { // If db.json doesn't exist
            return { tools: [], categories: [], settings: {} };
        }
        throw error;
    }
};

// --- Write queue to prevent concurrent write corruption ---
let writeQueue = Promise.resolve();
const writeDb = async (data) => {
    writeQueue = writeQueue.then(async () => {
        await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    }).catch(err => {
        console.error('[DB] Write error:', err);
    });
    return writeQueue;
};

// JWT Auth middleware
const jwtAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Unauthorized');
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') throw new Error();
        next();
    } catch {
        res.status(401).send('Unauthorized');
    }
};

// --- API Routes ---
const apiRouter = express.Router();

// --- New Combined Data API ---
apiRouter.get('/all-data', async (req, res) => {
    try {
        const db = await readDb();
        const tools = db.tools || [];
        const categories = db.categories || [];

        // Create a map for easy category lookup
        const categoryMap = {};
        categories.forEach(category => {
            categoryMap[category.id] = { 
                ...category, 
                tools: [], 
                subcategories: [] 
            };
        });

        // Distribute tools into their respective categories (newest first)
        const sortedTools = [...tools].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        sortedTools.forEach(tool => {
            if (categoryMap[tool.categoryId]) {
                categoryMap[tool.categoryId].tools.push(tool);
            }
        });
        
        // Structure categories into main and sub-categories
        const mainCategories = [];
        const subcategories = [];

        Object.values(categoryMap).forEach(category => {
            if (category.parentId) {
                subcategories.push(category);
            } else {
                mainCategories.push(category);
            }
        });
        
        subcategories.forEach(subcategory => {
            if (categoryMap[subcategory.parentId]) {
                categoryMap[subcategory.parentId].subcategories.push(subcategory);
            }
        });

        // Sort main categories by order
        mainCategories.sort((a, b) => a.order - b.order);
        // Sort sub-categories within each main category by order
        mainCategories.forEach(cat => {
            if (cat.subcategories) {
                cat.subcategories.sort((a, b) => a.order - b.order);
            }
        });

        res.json({ categories: mainCategories, settings: db.settings });

    } catch (error) {
        console.error("Error fetching all data:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// --- Auth API ---
apiRouter.post('/auth/login', loginLimiter, (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ token });
    } else {
        res.status(401).send('Unauthorized');
    }
});

// --- Settings API ---
apiRouter.get('/settings', async (req, res) => {
    const db = await readDb();
    res.json(db.settings);
});

apiRouter.put('/settings', jwtAuth, async (req, res) => {
    const newSettings = req.body;
    const db = await readDb();
    db.settings = { ...db.settings, ...newSettings }; // Merge settings
    await writeDb(db);
    res.json(db.settings);
});

// --- Categories API ---

// GET all categories
apiRouter.get('/categories', async (req, res) => {
    const db = await readDb();
    const sortedCategories = (db.categories || []).sort((a, b) => a.order - b.order);
    res.json(sortedCategories);
});

// POST new category
apiRouter.post('/categories', jwtAuth, async (req, res) => {
    const { name, parentId } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    
    const db = await readDb();
    const newCategory = {
        id: Date.now().toString(),
        name,
        order: (db.categories.length > 0) ? Math.max(...db.categories.map(c => c.order)) + 1 : 1,
        parentId: parentId || null
    };
    db.categories.push(newCategory);
    await writeDb(db);
    res.status(201).json(newCategory);
});

// PUT update categories (for reordering and renaming)
apiRouter.put('/categories', jwtAuth, async (req, res) => {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ message: 'Request body must be an object with an "updates" array.' });
    }
    const db = await readDb();
    
    updates.forEach(update => {
        const category = db.categories.find(c => c.id === update.id);
        if (category) {
            if (update.order !== undefined) {
                category.order = update.order;
            }
            if (update.name !== undefined) {
                category.name = update.name;
            }
            if (update.parentId !== undefined) {
                category.parentId = update.parentId;
            }
        }
    });

    await writeDb(db);
    res.json(db.categories);
});

// PUT update a single category's name
apiRouter.put('/categories/:id', jwtAuth, async (req, res) => {
    const { id } = req.params;
    const { name, parentId } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Name is required' });
    }

    const db = await readDb();
    const categoryIndex = db.categories.findIndex(c => c.id === id);

    if (categoryIndex === -1) {
        return res.status(404).json({ message: 'Category not found' });
    }

    db.categories[categoryIndex].name = name;
    db.categories[categoryIndex].parentId = parentId || null;
    await writeDb(db);
    res.json(db.categories[categoryIndex]);
});

// DELETE a category
apiRouter.delete('/categories/:id', jwtAuth, async (req, res) => {
    const { id } = req.params;
    const db = await readDb();

    // Prevent deletion if category is in use by any tools
    const isCategoryInUse = db.tools.some(tool => tool.categoryId === id);
    if (isCategoryInUse) {
        return res.status(400).json({ message: 'Cannot delete category: it is currently in use by one or more tools.' });
    }

    // Find children of the category to be deleted
    const children = db.categories.filter(c => c.parentId === id);
    if (children.length > 0) {
        // Set parentId of children to null, making them top-level categories
        children.forEach(child => {
            const childIndex = db.categories.findIndex(c => c.id === child.id);
            if (childIndex !== -1) {
                db.categories[childIndex].parentId = null;
            }
        });
    }

    db.categories = db.categories.filter(c => c.id !== id);
    await writeDb(db);
    res.status(204).send();
});


// --- Tools API ---

// Get all tools (Public)
apiRouter.get('/tools', async (req, res) => {
    const db = await readDb();
    res.json(db.tools || []);
});

// Add a new tool (Protected)
apiRouter.post('/tools', jwtAuth, async (req, res) => {
    const { title, description, url, categoryId, tags, thumbnail, embedUrl, type, platform, favicon } = req.body;
    if (!title || !description || !url || !categoryId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const db = await readDb();
    const newTool = { id: Date.now().toString(), title, description, url, categoryId, tags: tags || [], createdAt: new Date().toISOString(),
        ...(thumbnail && { thumbnail }), ...(embedUrl && { embedUrl }), 
        ...(type && { type }), ...(platform && { platform }), ...(favicon && { favicon }) };
    db.tools.push(newTool);
    await writeDb(db);
    res.status(201).json(newTool);
});

// Update a tool (Protected)
apiRouter.put('/tools/:id', jwtAuth, async (req, res) => {
    const { id } = req.params;
    const { title, description, url, categoryId, tags, thumbnail, embedUrl, type, platform, favicon } = req.body;
    const db = await readDb();
    
    const toolIndex = db.tools.findIndex(t => t.id === id);
    if (toolIndex === -1) {
        return res.status(404).json({ message: 'Tool not found' });
    }

    const updatedTool = { ...db.tools[toolIndex], title, description, url, categoryId, tags: tags || [],
        ...(thumbnail !== undefined && { thumbnail }), ...(embedUrl !== undefined && { embedUrl }),
        ...(type !== undefined && { type }), ...(platform !== undefined && { platform }),
        ...(favicon !== undefined && { favicon }) };
    db.tools[toolIndex] = updatedTool;
    await writeDb(db);
    res.json(updatedTool);
});

// Delete a tool (Protected)
apiRouter.delete('/tools/:id', jwtAuth, async (req, res) => {
    const { id } = req.params;
    const db = await readDb();

    const filteredTools = db.tools.filter(t => t.id !== id);
    if (filteredTools.length === db.tools.length) {
        return res.status(404).json({ message: 'Tool not found' });
    }

    db.tools = filteredTools;
    await writeDb(db);
    res.status(204).send(); // No content
});

app.use('/api', apiRouter);

// --- URL Parse API (for video/site info extraction) ---
const https = require('https');
const http = require('http');

function fetchUrl(url, options = {}) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...options.headers
            },
            timeout: 8000
        }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = res.headers.location.startsWith('http') 
                    ? res.headers.location 
                    : new URL(res.headers.location, url).href;
                return fetchUrl(redirectUrl, options).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function parseBilibili(url) {
    // Match BV id from various bilibili URL formats
    const bvMatch = url.match(/BV[a-zA-Z0-9]+/);
    if (!bvMatch) return null;
    const bvid = bvMatch[0];
    return { platform: 'bilibili', type: 'video', bvid, embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0` };
}

function parseYouTube(url) {
    let videoId = null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (match) videoId = match[1];
    if (!videoId) return null;
    return { platform: 'youtube', type: 'video', videoId, 
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=0` };
}

async function getBilibiliInfo(bvid) {
    try {
        const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const resp = await fetchUrl(apiUrl);
        const data = JSON.parse(resp.body);
        if (data.code === 0 && data.data) {
            return {
                title: data.data.title,
                description: data.data.desc || '',
                thumbnail: data.data.pic?.replace('http:', 'https:'),
                author: data.data.owner?.name || ''
            };
        }
    } catch (e) {
        console.error('[Parse] Bilibili API error:', e.message);
    }
    return null;
}

async function getWebsiteInfo(url) {
    try {
        const resp = await fetchUrl(url);
        const html = resp.body;
        const getMeta = (prop) => {
            const patterns = [
                new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
                new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
                new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
                new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, 'i'),
            ];
            for (const p of patterns) {
                const m = html.match(p);
                if (m) return m[1];
            }
            return null;
        };
        
        const title = getMeta('og:title') || getMeta('title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
        const description = getMeta('og:description') || getMeta('description') || '';
        const ogImage = getMeta('og:image') || '';
        const siteName = getMeta('og:site_name') || '';
        
        // Try to find favicon
        let favicon = '';
        const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) 
            || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
        if (faviconMatch) {
            favicon = faviconMatch[1].startsWith('http') ? faviconMatch[1] : new URL(faviconMatch[1], url).href;
        }
        if (!favicon) {
            // Try apple-touch-icon
            const appleMatch = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i);
            if (appleMatch) favicon = appleMatch[1].startsWith('http') ? appleMatch[1] : new URL(appleMatch[1], url).href;
        }
        if (!favicon) {
            // Default favicon.ico
            try { favicon = new URL('/favicon.ico', url).href; } catch(e) {}
        }

        return { title: title.trim(), description: description.trim(), thumbnail: ogImage, favicon, siteName };
    } catch (e) {
        console.error('[Parse] Website info error:', e.message);
        return null;
    }
}

apiRouter.post('/parse-url', jwtAuth, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: 'URL is required' });

    try {
        // Detect platform
        const bilibili = parseBilibili(url);
        const youtube = parseYouTube(url);

        if (bilibili) {
            const info = await getBilibiliInfo(bilibili.bvid);
            return res.json({
                type: 'video',
                platform: 'bilibili',
                title: info?.title || '',
                description: info?.description || '',
                thumbnail: info?.thumbnail || '',
                embedUrl: bilibili.embedUrl,
                author: info?.author || ''
            });
        }

        if (youtube) {
            return res.json({
                type: 'video',
                platform: 'youtube',
                title: '',
                description: '',
                thumbnail: youtube.thumbnail,
                embedUrl: youtube.embedUrl,
                author: ''
            });
        }

        // Regular website
        const info = await getWebsiteInfo(url);
        if (info) {
            return res.json({
                type: 'webpage',
                platform: null,
                title: info.title,
                description: info.description,
                thumbnail: info.ogImage || '',
                favicon: info.favicon,
                siteName: info.siteName,
                embedUrl: null
            });
        }

        return res.json({ type: 'unknown', platform: null, title: '', description: '', thumbnail: '', favicon: '', embedUrl: null });

    } catch (error) {
        console.error('[Parse URL Error]', error.message);
        res.status(500).json({ message: '解析失败，请稍后重试' });
    }
});

// --- Serve Static Files ---
// This should come AFTER all API routes.
// Block direct access to admin.html (now served at hidden path)
app.use((req, res, next) => {
    if (req.path === '/admin.html') {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
    next();
});
app.use(express.static(path.join(__dirname)));

// --- Protect admin page (hidden path) ---
app.get(ADMIN_PATH, (req, res, next) => {
    // Serve admin.html at the hidden path (JWT check removed for login page)
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- Catch-all for 404s ---
// This should be the last middleware.
app.use((req, res, next) => {
    console.log(`[404] Unmatched route: ${req.method} ${req.originalUrl}`);
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 