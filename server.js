require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');
// For better security, it's recommended to set this password via an environment variable.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'jimplay.cn';
const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret';

// --- Middleware ---
app.use(cors());
app.use(express.json()); // For parsing application/json

// --- Rate Limiter for login ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later'
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

const writeDb = async (data) => {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
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

        // Distribute tools into their respective categories
        tools.forEach(tool => {
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
apiRouter.put('/tools/:id', jwtAuth, async (req, res) => {
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

// --- Serve Static Files ---
// This should come AFTER all API routes.
app.use(express.static(path.join(__dirname)));

// --- Protect admin.html ---
app.get('/admin.html', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(404).send('Not Found');
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') throw new Error();
        next();
    } catch {
        res.status(404).send('Not Found');
    }
});

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