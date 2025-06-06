document.addEventListener('DOMContentLoaded', () => {
    // --- Global Elements & State ---
    const loginView = document.getElementById('login-view');
    const adminPanel = document.getElementById('admin-panel');
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    let adminPassword = sessionStorage.getItem('adminPassword');

    // SVG Icons for password toggle
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line></svg>`;
    
    // --- API URLs ---
    const API_URLS = {
        TOOLS: '/api/tools',
        CATEGORIES: '/api/categories',
        SETTINGS: '/api/settings',
        AUTH_CHECK: '/api/auth/check'
    };

    // --- View Switching ---
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    // --- Tool Management Elements ---
    const toolsListSection = document.getElementById('tools-list');
    const addToolBtn = document.getElementById('add-tool-btn');
    const toolModal = document.getElementById('tool-modal');
    const modalCloseBtn = toolModal.querySelector('.modal-close-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const editForm = document.getElementById('edit-form');
    const formTitle = document.getElementById('form-title');
    const toolIdInput = document.getElementById('tool-id');
    const toolTitleInput = document.getElementById('tool-title');
    const toolUrlInput = document.getElementById('tool-url');
    const toolDescriptionInput = document.getElementById('tool-description');
    const toolCategorySelect = document.getElementById('tool-category');
    
    // --- Tag Input Elements ---
    const tagsContainer = document.getElementById('tags-container');
    const tagsInput = document.getElementById('tool-tags-input');
    const tagsSuggestions = document.getElementById('tags-suggestions');

    // --- Category Management Elements ---
    const categoryList = document.getElementById('category-list');
    const addCategoryBtn = document.getElementById('add-category-btn');
    const categoryModal = document.getElementById('category-modal');
    const categoryForm = document.getElementById('category-edit-form');
    const categoryFormTitle = document.getElementById('category-form-title');
    const categoryIdInput = document.getElementById('category-id');
    const categoryNameInput = document.getElementById('category-name');
    const cancelCategoryEditBtn = document.getElementById('cancel-category-edit-btn');
    const categoryModalCloseBtn = categoryModal.querySelector('.modal-close-btn');
    const saveCategoryOrderBtn = document.getElementById('save-category-order-btn');

    // --- Settings Management Elements ---
    const settingsForm = document.getElementById('settings-form');
    const icpInput = document.getElementById('icp-input');
    const icpUrlInput = document.getElementById('icp-url-input');

    // --- State ---
    let categories = [];
    let tools = [];
    let settings = {};
    let allTags = new Set();
    let suggestionIndex = -1;
    let isComposing = false;

    // --- View Switching Logic ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = item.dataset.view;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            views.forEach(view => {
                view.classList.toggle('active', view.id === viewId);
            });
        });
    });

    // --- API Fetch Utility ---
    const apiFetch = async (url, options = {}, tempPassword = null) => {
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        const pass = tempPassword || adminPassword;
        if (pass) headers['Authorization'] = pass;
        
        try {
            const response = await fetch(url, { ...options, headers });
            if (response.status === 401) {
                showLoginView();
                throw new Error('Unauthorized');
            }
            if (!response.ok) {
                const err = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(err.message || 'An unknown error occurred');
            }
            return response.status === 204 ? null : response.json();
        } catch (error) {
            console.error('API Fetch Error:', error);
            throw error;
        }
    };

    // --- Render Functions ---
    const renderTools = (tools, categories) => {
        const toolsListSection = document.getElementById('tools-list');
        if (!toolsListSection) return;

        if (tools.length === 0) {
            toolsListSection.innerHTML = '<p class="empty-state-message">还没有工具，点击"新建工具"来添加一个吧。</p>';
            return;
        }

        const tableRows = tools.map(tool => {
            const category = categories.find(c => c.id === tool.categoryId);
            return `
                <tr>
                    <td>
                        <div class="cell-content">
                            <span class="tool-title">${tool.title}</span>
                            <a href="${tool.url}" target="_blank" class="tool-url">${tool.url}</a>
                        </div>
                    </td>
                    <td><span class="tag-cell">${category ? category.name : '未分类'}</span></td>
                    <td>
                        <div class="actions-cell">
                            <button class="btn btn-secondary edit-tool-btn" data-id="${tool.id}">编辑</button>
                            <button class="btn btn-danger delete-tool-btn" data-id="${tool.id}">删除</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        toolsListSection.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>标题</th>
                        <th>栏目</th>
                        <th class="actions-header">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    };

    const renderCategories = () => {
        categoryList.innerHTML = '';
        categories.forEach(c => {
            const el = document.createElement('div');
            el.className = 'category-item';
            el.dataset.id = c.id;
            el.draggable = true;
            el.innerHTML = `
                <span class="category-item-name">${c.name}</span>
                <div class="category-item-actions">
                    <button class="btn btn-secondary edit-category-btn" data-id="${c.id}">编辑</button>
                    <button class="delete-category-btn" data-id="${c.id}" aria-label="Delete category">&times;</button>
                </div>`;
            categoryList.appendChild(el);
        });
        updateCategoryOptions();
    };

    const renderSettings = (settings) => {
        if (icpInput) {
            icpInput.value = settings.icp || '';
        }
        if (icpUrlInput) {
            icpUrlInput.value = settings.icpUrl || '';
        }
    };

    const updateCategoryOptions = () => {
        const currentVal = toolCategorySelect.value;
        toolCategorySelect.innerHTML = '<option value="">选择栏目...</option>';
        categories.forEach(c => toolCategorySelect.add(new Option(c.name, c.id)));
        toolCategorySelect.value = currentVal;
    };

    // --- Main Data Loading ---
    const loadAdminData = async () => {
        try {
            [settings, categories, tools] = await Promise.all([
                apiFetch(API_URLS.SETTINGS),
                apiFetch(API_URLS.CATEGORIES),
                apiFetch(API_URLS.TOOLS)
            ]);
            allTags = new Set(tools.flatMap(t => t.tags || []));
            renderSettings(settings);
            renderCategories();
            renderTools(tools, categories);
        } catch (error) {
            if (error.message !== 'Unauthorized') {
                alert(`加载管理数据失败: ${error.message}`);
            }
        }
    };

    // --- Modal Logic ---
    const openModal = () => toolModal.style.display = 'flex';
    const closeModal = () => {
        toolModal.style.display = 'none';
        resetForm();
    };

    const resetForm = () => {
        editForm.reset();
        toolIdInput.value = '';
        tagsContainer.querySelectorAll('.tag-pill').forEach(pill => pill.remove());
        tagsInput.value = '';
    };

    // --- Tag Input Logic ---
    const createTagPill = (tagValue) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.textContent = tagValue;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-tag';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => pill.remove();
        pill.appendChild(removeBtn);
        tagsContainer.insertBefore(pill, tagsInput);
    };

    const getCurrentTags = () => {
        return Array.from(tagsContainer.querySelectorAll('.tag-pill')).map(pill => pill.firstChild.textContent);
    };

    tagsInput.addEventListener('compositionstart', () => { isComposing = true; });
    tagsInput.addEventListener('compositionend', () => { isComposing = false; });

    tagsInput.addEventListener('keydown', (e) => {
        if (isComposing) return;

        // Only Enter creates a tag
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = tagsInput.value.trim();
            if (value) {
                createTagPill(value);
                tagsInput.value = '';
                hideSuggestions();
            }
        } else if (e.key === 'Backspace' && tagsInput.value === '') {
            const lastTag = tagsContainer.querySelector('.tag-pill:last-of-type');
            if (lastTag) lastTag.remove();
        } else if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
             e.preventDefault();
             navigateSuggestions(e.key);
        }
    });
    
    tagsInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text');
        const tagValues = pastedText.split(/[,;\s]+/).filter(Boolean);
        tagValues.forEach(tag => createTagPill(tag.trim()));
    });

    tagsInput.addEventListener('input', () => {
        const query = tagsInput.value.trim().toLowerCase();
        if (query) {
            const suggestions = [...allTags].filter(tag => tag.toLowerCase().includes(query) && !getCurrentTags().includes(tag));
            showSuggestions(suggestions);
        } else {
            hideSuggestions();
        }
    });

    const showSuggestions = (suggestions) => {
        if(suggestions.length === 0) {
            hideSuggestions();
            return;
        }
        tagsSuggestions.innerHTML = `<ul>${suggestions.map(s => `<li>${s}</li>`).join('')}</ul>`;
        tagsSuggestions.firstChild.addEventListener('click', (e) => {
            if(e.target.tagName === 'LI') {
                createTagPill(e.target.textContent);
                tagsInput.value = '';
                hideSuggestions();
                tagsInput.focus();
            }
        });
        tagsSuggestions.style.display = 'block';
        suggestionIndex = -1;
    };
    
    const hideSuggestions = () => {
        tagsSuggestions.style.display = 'none';
        tagsSuggestions.innerHTML = '';
    };

    const navigateSuggestions = (direction) => {
        const items = tagsSuggestions.querySelectorAll('li');
        if (items.length === 0) return;
    
        items[suggestionIndex]?.classList.remove('selected');
    
        if (direction === 'ArrowDown') {
            suggestionIndex = (suggestionIndex + 1) % items.length;
        } else if (direction === 'ArrowUp') {
            suggestionIndex = (suggestionIndex - 1 + items.length) % items.length;
        }
    
        items[suggestionIndex]?.classList.add('selected');
        tagsInput.value = items[suggestionIndex]?.textContent;
    };

    // --- Event Handlers ---
    addToolBtn.addEventListener('click', () => {
        resetForm();
        formTitle.textContent = '添加新工具';
        openModal();
    });

    modalCloseBtn.addEventListener('click', closeModal);
    cancelEditBtn.addEventListener('click', closeModal);
    
    toolsListSection.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        const id = target.dataset.id;
        if (target.classList.contains('delete-tool-btn')) {
            if (confirm(`确定要删除这个工具吗?`)) {
                try {
                    await apiFetch(`${API_URLS.TOOLS}/${id}`, { method: 'DELETE' });
                    loadAdminData();
                } catch (err) {
                    alert(`删除失败: ${err.message}`);
                }
            }
        } else if (target.classList.contains('edit-tool-btn')) {
            const tool = tools.find(t => t.id === id);
            if (tool) {
                resetForm();
                formTitle.textContent = '编辑工具';
                toolIdInput.value = tool.id;
                toolTitleInput.value = tool.title;
                toolUrlInput.value = tool.url;
                toolDescriptionInput.value = tool.description;
                toolCategorySelect.value = tool.categoryId;
                (tool.tags || []).forEach(createTagPill);
                openModal();
            }
        }
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = toolIdInput.value;
        const data = {
            title: toolTitleInput.value,
            url: toolUrlInput.value,
            description: toolDescriptionInput.value,
            categoryId: toolCategorySelect.value,
            tags: getCurrentTags()
        };
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URLS.TOOLS}/${id}` : API_URLS.TOOLS;
        
        try {
            await apiFetch(url, { method, body: JSON.stringify(data) });
            closeModal();
            loadAdminData();
        } catch (err) {
            alert(`保存失败: ${err.message}`);
        }
    });

    // --- Category Modal Logic ---
    const openCategoryModal = (id = null) => {
        categoryForm.reset();
        if (id) {
            const category = categories.find(c => c.id === id);
            categoryFormTitle.textContent = '编辑栏目';
            categoryIdInput.value = category.id;
            categoryNameInput.value = category.name;
        } else {
            categoryFormTitle.textContent = '添加新栏目';
            categoryIdInput.value = '';
        }
        categoryModal.style.display = 'flex';
        categoryNameInput.focus();
    };
    
    const closeCategoryModal = () => {
        categoryModal.style.display = 'none';
    };

    // --- Category Management Event Handlers ---
    addCategoryBtn.addEventListener('click', () => openCategoryModal());

    categoryModalCloseBtn.addEventListener('click', closeCategoryModal);
    cancelCategoryEditBtn.addEventListener('click', closeCategoryModal);

    categoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = categoryIdInput.value;
        const name = categoryNameInput.value.trim();
        if (!name) return;

        const url = id ? `${API_URLS.CATEGORIES}/${id}` : API_URLS.CATEGORIES;
        const method = id ? 'PUT' : 'POST';

        try {
            await apiFetch(url, { method, body: JSON.stringify({ name }) });
            closeCategoryModal();
            loadAdminData();
        } catch (err) {
            alert(`保存栏目失败: ${err.message}`);
        }
    });

    categoryList.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        if (button.classList.contains('delete-category-btn')) {
            if (confirm('确定要删除此栏目吗?')) {
                try {
                    await apiFetch(`${API_URLS.CATEGORIES}/${id}`, { method: 'DELETE' });
                    loadAdminData();
                } catch (err) {
                    alert(`删除栏目失败: ${err.message}`);
                }
            }
        } else if (button.classList.contains('edit-category-btn')) {
            openCategoryModal(id);
        }
    });

    // DnD for categories
    let draggedItem = null;
    categoryList.addEventListener('dragstart', (e) => {
        draggedItem = e.target;
        setTimeout(() => e.target.style.opacity = '0.5', 0);
    });
    categoryList.addEventListener('dragend', (e) => {
        e.target.style.opacity = '1';
        draggedItem = null;
        saveCategoryOrderBtn.style.display = 'inline-block';
    });
    categoryList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = [...categoryList.querySelectorAll('.category-item:not(.dragging)')].reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
        
        if (draggedItem && draggedItem !== afterElement) {
            if (afterElement == null) {
                categoryList.appendChild(draggedItem);
            } else {
                categoryList.insertBefore(draggedItem, afterElement);
            }
        }
    });
    
    saveCategoryOrderBtn.addEventListener('click', async () => {
        const orderedCategories = [...categoryList.querySelectorAll('.category-item')].map((item, index) => ({
            id: item.dataset.id,
            order: index
        }));
        
        try {
            await apiFetch(API_URLS.CATEGORIES, { method: 'PUT', body: JSON.stringify({ updates: orderedCategories }) });
            saveCategoryOrderBtn.style.display = 'none';
            loadAdminData();
        } catch (err) {
            alert(`保存栏目顺序失败: ${err.message}`);
        }
    });

    // --- Settings CRUD ---
    const setupEventListeners = () => {
        if (settingsForm) {
            settingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const icpInput = document.getElementById('icp-input');
                const icpUrlInput = document.getElementById('icp-url-input');
                const newSettings = {
                    icp: icpInput.value.trim(),
                    icpUrl: icpUrlInput.value.trim()
                };
                try {
                    await updateSettings(newSettings);
                    alert('设置已保存！');
                } catch (error) {
                    alert('保存失败，请稍后重试。');
                }
            });
        }
    };

    // --- Authentication ---
    const checkAuth = async (password) => {
        try {
            await apiFetch(API_URLS.AUTH_CHECK, { method: 'POST' }, password); 
            return true;
        } catch (error) {
            return false;
        }
    };
    
    const setupLogin = () => {
        const loginForm = document.getElementById('login-form');
        const passwordInput = document.getElementById('password');
        const loginError = document.getElementById('login-error');
        const togglePasswordBtn = document.getElementById('toggle-password');

        const showIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
        const hideIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" /></svg>`;

        if (togglePasswordBtn) {
            togglePasswordBtn.innerHTML = showIcon;
            togglePasswordBtn.addEventListener('click', () => {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    togglePasswordBtn.innerHTML = hideIcon;
                } else {
                    passwordInput.type = 'password';
                    togglePasswordBtn.innerHTML = showIcon;
                }
            });
        }

        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                loginError.textContent = '';
                const password = passwordInput.value;
                if (!password) {
                    loginError.textContent = '请输入密码。';
                    return;
                }
                const isValid = await checkAuth(password);

                if (isValid) {
                    adminPassword = password;
                    sessionStorage.setItem('adminPassword', password);
                    showAdminPanel();
                } else {
                    loginError.textContent = '密码错误，请重试。';
                    passwordInput.focus();
                }
            });
        }
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const password = passwordInput.value;
        if (!password) {
            loginError.textContent = '请输入密码。';
            return;
        }
        const isValid = await checkAuth(password);

        if (isValid) {
            adminPassword = password;
            sessionStorage.setItem('adminPassword', password);
            showAdminPanel();
        } else {
            loginError.textContent = '密码错误，请重试。';
            passwordInput.focus();
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('adminPassword');
        adminPassword = null;
        showLoginView();
    });

    const showLoginView = () => {
        adminPanel.style.display = 'none';
        loginView.style.display = 'block';
        passwordInput.value = '';
        togglePasswordBtn.innerHTML = eyeIcon;
    };
    
    const showAdminPanel = () => {
        loginView.style.display = 'none';
        adminPanel.style.display = 'flex';
        loadAdminData();
    };

    // --- Theme Switcher Logic ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsContainer = document.getElementById('settings-container');
    const themeBtns = document.querySelectorAll('.theme-btn');
    const htmlEl = document.documentElement;

    const setupThemeSwitcher = () => {
        // Settings Menu Toggle
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (settingsContainer) settingsContainer.classList.toggle('open');
            });
        }
        document.addEventListener('click', (e) => {
            if (settingsContainer && !settingsContainer.contains(e.target)) {
                settingsContainer.classList.remove('open');
            }
        });

        // Theme Switcher
        themeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const theme = btn.dataset.theme;
                htmlEl.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
                
                themeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Initialize theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        htmlEl.setAttribute('data-theme', savedTheme);
        themeBtns.forEach(btn => {
            if (btn.dataset.theme === savedTheme) {
                btn.classList.add('active');
            }
        });
    };

    // --- Initialization ---
    const initialize = async () => {
        togglePasswordBtn.innerHTML = eyeIcon; // Set initial icon
        if (adminPassword && await checkAuth(adminPassword)) {
            showAdminPanel();
            setupThemeSwitcher(); // Initialize theme switcher only after login
        } else {
            showLoginView();
        }
        setupEventListeners();
        setupLogin();
    };

    initialize();
}); 