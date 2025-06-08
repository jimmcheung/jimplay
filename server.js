require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret';
const SALT_ROUNDS = 10;

// --- Middleware ---
app.use(cors());
app.use(express.json()); // For parsing application/json

// --- Async Error Handling Utility ---
// Wraps async route handlers to catch errors and pass them to the error handler
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

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
        // If the file is empty, return a default structure
        if (data.trim() === '') {
            return { tools: [], categories: [], settings: {}, users: [] };
        }
        const db = JSON.parse(data);
        // Ensure all top-level keys exist to prevent crashes on corrupted data
        db.tools = db.tools || [];
        db.categories = db.categories || [];
        db.settings = db.settings || {};
        db.users = db.users || [];
        return db;
    } catch (error) {
        if (error.code === 'ENOENT') { // If db.json doesn't exist
            return { tools: [], categories: [], settings: {}, users: [] };
        }
        // For JSON parsing errors or other read errors, re-throw to be caught by error handler
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
apiRouter.get('/all-data', asyncHandler(async (req, res) => {
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
}));

// --- Auth API ---
apiRouter.post('/auth/login', loginLimiter, asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    const db = await readDb();
    const user = db.users.find(u => u.username === username);

    if (user && await bcrypt.compare(password, user.passwordHash)) {
        const token = jwt.sign({ userId: user.id, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
}));

// --- User Management API (Protected) ---

// GET all users
apiRouter.get('/users', jwtAuth, asyncHandler(async (req, res) => {
    const db = await readDb();
    const users = db.users.map(({ passwordHash, ...user }) => user); // Exclude password hash
    res.json(users);
}));

// POST create a new user
apiRouter.post('/users', jwtAuth, asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    const db = await readDb();
    if (db.users.some(u => u.username === username)) {
        return res.status(409).json({ message: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = {
        id: `user_${Date.now()}`,
        username,
        passwordHash,
    };
    db.users.push(newUser);
    await writeDb(db);

    const { passwordHash: _, ...userToReturn } = newUser;
    res.status(201).json(userToReturn);
}));

// PUT update a user's password
apiRouter.put('/users/:id', jwtAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    if (!username && !password) {
        return res.status(400).json({ message: 'Username or password is required' });
    }

    const db = await readDb();
    const userIndex = db.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (username) {
        // Check if new username already exists
        if (db.users.some(u => u.username === username && u.id !== id)) {
            return res.status(409).json({ message: 'Username already exists' });
        }
        db.users[userIndex].username = username;
    }

    if (password) {
        db.users[userIndex].passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    
    await writeDb(db);

    const { passwordHash, ...updatedUser } = db.users[userIndex];
    res.status(200).json(updatedUser);
}));

// DELETE a user
apiRouter.delete('/users/:id', jwtAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const db = await readDb();

    if (db.users.length <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin user' });
    }
    
    const userIndex = db.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    db.users.splice(userIndex, 1);
    await writeDb(db);
    res.status(204).send();
}));

// --- Settings API ---
apiRouter.get('/settings', jwtAuth, asyncHandler(async (req, res) => {
    const db = await readDb();
    res.json(db.settings);
}));

apiRouter.put('/settings', jwtAuth, asyncHandler(async (req, res) => {
    const newSettings = req.body;
    const db = await readDb();
    db.settings = { ...db.settings, ...newSettings }; // Merge settings
    await writeDb(db);
    res.json(db.settings);
}));

// --- Categories API ---

// GET all categories
apiRouter.get('/categories', jwtAuth, asyncHandler(async (req, res) => {
    const db = await readDb();
    const sortedCategories = (db.categories || []).sort((a, b) => a.order - b.order);
    res.json(sortedCategories);
}));

// POST new category
apiRouter.post('/categories', jwtAuth, asyncHandler(async (req, res) => {
    const { name, parentId } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    
    const db = await readDb();
    const newCategory = {
        id: Date.now().toString(),
        name,
        order: (db.categories.length > 0) ? Math.max(...db.categories.map(c => c.order || 0)) + 1 : 1,
        parentId: parentId || null
    };
    db.categories.push(newCategory);
    await writeDb(db);
    res.status(201).json(newCategory);
}));

// PUT update categories (for reordering and renaming)
apiRouter.put('/categories', jwtAuth, asyncHandler(async (req, res) => {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ message: 'Request body must be an object with an "updates" array.' });
    }
    const db = await readDb();
    
    updates.forEach(update => {
        const category = db.categories.find(c => c.id === update.id);
        if (category) {
            if (update.order !== undefined) category.order = update.order;
            if (update.name !== undefined) category.name = update.name;
            if (update.parentId !== undefined) category.parentId = update.parentId;
        }
    });

    await writeDb(db);
    res.json(db.categories);
}));

// PUT update a single category's name
apiRouter.put('/categories/:id', jwtAuth, asyncHandler(async (req, res) => {
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
    db.categories[categoryIndex].parentId = parentId === undefined ? db.categories[categoryIndex].parentId : parentId;
    await writeDb(db);
    res.json(db.categories[categoryIndex]);
}));

// DELETE a category
apiRouter.delete('/categories/:id', jwtAuth, asyncHandler(async (req, res) => {
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
}));


// --- Tools API ---

// Get all tools (Protected now for simplicity in admin panel, public route is /all-data)
apiRouter.get('/tools', jwtAuth, asyncHandler(async (req, res) => {
    const db = await readDb();
    res.json(db.tools || []);
}));

// Add a new tool (Protected)
apiRouter.post('/tools', jwtAuth, asyncHandler(async (req, res) => {
    const { title, description, url, categoryId, tags } = req.body;
    if (!title || !description || !url || !categoryId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const db = await readDb();
    const newTool = { id: Date.now().toString(), title, description, url, categoryId, tags: tags || [] };
    db.tools.push(newTool);
    await writeDb(db);
    res.status(201).json(newTool);
}));

// Update a tool (Protected)
apiRouter.put('/tools/:id', jwtAuth, asyncHandler(async (req, res) => {
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
}));

// Delete a tool (Protected)
apiRouter.delete('/tools/:id', jwtAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const db = await readDb();

    const filteredTools = db.tools.filter(t => t.id !== id);
    if (filteredTools.length === db.tools.length) {
        return res.status(404).json({ message: 'Tool not found' });
    }

    db.tools = filteredTools;
    await writeDb(db);
    res.status(204).send(); // No content
}));

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
// This should be the last middleware BEFORE the error handler.
app.use((req, res, next) => {
    res.status(404).json({ message: `Not Found - ${req.method} ${req.originalUrl}` });
});

// --- Centralized Error Handler ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({ message });
});

const initializeDatabase = async () => {
    const db = await readDb();
    let dbChanged = false;

    // Ensure default structure
    if (!db.users) { db.users = []; dbChanged = true; }
    if (!db.tools) { db.tools = []; dbChanged = true; }
    if (!db.categories) { db.categories = []; dbChanged = true; }
    if (!db.settings) { db.settings = {}; dbChanged = true; }

    // Ensure default admin user
    if (db.users.length === 0) {
        console.log('No admin user found. Creating default admin...');
        const defaultPassword = process.env.ADMIN_PASSWORD || 'jimplay.cn';
        const passwordHash = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
        db.users.push({
            id: 'user_1',
            username: 'admin',
            passwordHash,
        });
        dbChanged = true;
        console.log('Default admin user "admin" created.');
    }

    if (dbChanged) {
        await writeDb(db);
    }
};

// --- Server Start ---
const startServer = async () => {
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer(); 