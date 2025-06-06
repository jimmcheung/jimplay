console.log('--- Server.js file execution started ---');
const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const ADMIN_PASSWORD = 'jimplay.cn'; // 重要：请在部署前修改为一个更安全的密码

// --- Middleware ---
app.use(cors());
app.use(express.json()); // For parsing application/json

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

const writeDb = async (data) => {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
};

// Admin authentication middleware
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
};

// --- API Routes ---
const apiRouter = express.Router();

// --- Auth API ---
apiRouter.post('/auth/check', (req, res) => {
    console.log(`[AUTH] Received check request. Authorization header: ${req.headers.authorization}`);
    if (req.headers.authorization === ADMIN_PASSWORD) {
        console.log('[AUTH] Success.');
        res.status(200).json({ message: 'Authenticated successfully' });
    } else {
        console.log('[AUTH] Failed. Incorrect password.');
        res.status(401).send('Unauthorized');
    }
});

// --- Settings API ---
apiRouter.get('/settings', async (req, res) => {
    const db = await readDb();
    res.json(db.settings);
});

apiRouter.put('/settings', auth, async (req, res) => {
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
apiRouter.post('/categories', auth, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    
    const db = await readDb();
    const newCategory = {
        id: Date.now().toString(),
        name,
        order: (db.categories.length > 0) ? Math.max(...db.categories.map(c => c.order)) + 1 : 1
    };
    db.categories.push(newCategory);
    await writeDb(db);
    res.status(201).json(newCategory);
});

// PUT update categories (for reordering and renaming)
apiRouter.put('/categories', auth, async (req, res) => {
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
        }
    });

    await writeDb(db);
    res.json(db.categories);
});

// PUT update a single category's name
apiRouter.put('/categories/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Name is required' });
    }

    const db = await readDb();
    const categoryIndex = db.categories.findIndex(c => c.id === id);

    if (categoryIndex === -1) {
        return res.status(404).json({ message: 'Category not found' });
    }

    db.categories[categoryIndex].name = name;
    await writeDb(db);
    res.json(db.categories[categoryIndex]);
});

// DELETE a category
apiRouter.delete('/categories/:id', auth, async (req, res) => {
    const { id } = req.params;
    const db = await readDb();

    // Prevent deletion if category is in use
    const isCategoryInUse = db.tools.some(tool => tool.categoryId === id);
    if (isCategoryInUse) {
        return res.status(400).json({ message: 'Cannot delete category: it is currently in use by one or more tools.' });
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
apiRouter.post('/tools', auth, async (req, res) => {
    const { title, description, url, categoryId, tags } = req.body;
    if (!title || !description || !url || !categoryId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const db = await readDb();
    const newTool = { id: Date.now().toString(), title, description, url, categoryId, tags: tags || [] };
    db.tools.push(newTool);
    await writeDb(db);
    res.status(201).json(newTool);
});

// Update a tool (Protected)
apiRouter.put('/tools/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { title, description, url, categoryId, tags } = req.body;
    const db = await readDb();
    
    const toolIndex = db.tools.findIndex(t => t.id === id);
    if (toolIndex === -1) {
        return res.status(404).json({ message: 'Tool not found' });
    }

    const updatedTool = { ...db.tools[toolIndex], title, description, url, categoryId, tags: tags || [] };
    db.tools[toolIndex] = updatedTool;
    await writeDb(db);
    res.json(updatedTool);
});

// Delete a tool (Protected)
apiRouter.delete('/tools/:id', auth, async (req, res) => {
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

// --- Serve Static Files ---
// This should come AFTER all API routes.
app.use(express.static(path.join(__dirname)));

// --- Catch-all for 404s ---
// This should be the last middleware.
app.use((req, res, next) => {
    console.log(`[404] Unmatched route: ${req.method} ${req.originalUrl}`);
    res.status(404).send('Not Found');
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Admin password is: ' + ADMIN_PASSWORD);
}); 