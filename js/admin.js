document.addEventListener('DOMContentLoaded', () => {
    // --- Global Elements & State ---
    const loginView = document.getElementById('login-view');
    const adminPanel = document.getElementById('admin-panel');
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    let adminToken = sessionStorage.getItem('adminToken');

    // SVG Icons for password toggle
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line></svg>`;
    
    // --- API URLs ---
    const API_URLS = {
        TOOLS: '/api/tools',
        CATEGORIES: '/api/categories',
        SETTINGS: '/api/settings',
        AUTH_LOGIN: '/api/auth/login'
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
    const categoryParentSelect = document.getElementById('category-parent');
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
    const apiFetch = async (url, options = {}) => {
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
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
            const categoryName = category ? (category.parentId ? `${categories.find(p=>p.id===category.parentId).name} / ${category.name}` : category.name) : '未分类';
            return `
                <tr>
                    <td>
                        <div class="cell-content">
                            <span class="tool-title">${tool.title}</span>
                            <a href="${tool.url}" target="_blank" class="tool-url">${tool.url}</a>
                        </div>
                    </td>
                    <td><span class="tag-cell">${categoryName}</span></td>
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
        const categoryList = document.getElementById('category-list');
        categoryList.innerHTML = '';
        const categoryTree = buildCategoryTree(categories);

        const renderCategoryItem = (category, level) => {
            const el = document.createElement('div');
            el.className = 'category-item';
            el.dataset.id = category.id;
            el.style.marginLeft = `${level * 20}px`;
            el.draggable = true;

            el.innerHTML = `
                <span class="category-dragger">::</span>
                <span class="category-item-name">${category.name}</span>
                <div class="category-item-actions">
                    <button class="btn btn-secondary btn-sm edit-category-btn" data-id="${category.id}">编辑</button>
                    <button class="btn btn-danger btn-sm delete-category-btn" data-id="${category.id}">删除</button>
                </div>`;
            categoryList.appendChild(el);

            if (category.children.length > 0) {
                category.children.forEach(child => renderCategoryItem(child, level + 1));
            }
        };

        categoryTree.forEach(category => renderCategoryItem(category, 0));
        renderCategoryDropdowns();
    };

    const renderSettings = (settings) => {
        if (icpInput) {
            icpInput.value = settings.icp || '';
        }
        if (icpUrlInput) {
            icpUrlInput.value = settings.icpUrl || '';
        }
    };

    const renderCategoryDropdowns = () => {
        // Preserve current selections
        const toolCatVal = toolCategorySelect.value;
        const parentCatVal = categoryParentSelect.value;
        
        // Clear existing options
        toolCategorySelect.innerHTML = '<option value="">选择栏目...</option>';
        categoryParentSelect.innerHTML = '<option value="">-- 无 (顶级栏目) --</option>';

        const categoryTree = buildCategoryTree(categories);

        categoryTree.forEach(function renderNode(category) {
             // Populate the parent category dropdown (for the category form)
            categoryParentSelect.add(new Option(category.name, category.id));

            // Populate the tool category dropdown
            if (category.children.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category.name;
                
                // Add the parent category itself as the first, selectable option in its group
                optgroup.appendChild(new Option(category.name, category.id));
                
                // Then, add all its children
                category.children.forEach(child => {
                    optgroup.appendChild(new Option(`— ${child.name}`, child.id));
                });
                toolCategorySelect.appendChild(optgroup);
            } else {
                // If it's a top-level category with no children, just add it
                toolCategorySelect.add(new Option(category.name, category.id));
            }
        });
        
        // Restore previous selections
        toolCategorySelect.value = toolCatVal;
        categoryParentSelect.value = parentCatVal;
    };

    const buildCategoryTree = (categories) => {
        const categoryMap = {};
        const roots = [];
        const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

        sortedCategories.forEach(category => {
            categoryMap[category.id] = { ...category, children: [] };
        });

        sortedCategories.forEach(category => {
            if (category.parentId && categoryMap[category.parentId]) {
                categoryMap[category.parentId].children.push(categoryMap[category.id]);
            } else {
                roots.push(categoryMap[category.id]);
            }
        });
        return roots;
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
        categoryIdInput.value = '';
        renderCategoryDropdowns(); // First, populate dropdowns

        if (id) {
            const category = categories.find(c => c.id === id);
            if (category) {
                categoryFormTitle.textContent = '编辑栏目';
                categoryIdInput.value = category.id;
                categoryNameInput.value = category.name;
                categoryParentSelect.value = category.parentId || '';
                // Disable selecting itself or its children as parent
                const childIds = getDescendantIds(id);
                categoryParentSelect.querySelectorAll('option').forEach(opt => {
                    opt.disabled = (opt.value === id || childIds.has(opt.value));
                });
            }
        } else {
            categoryFormTitle.textContent = '添加新栏目';
        }
        categoryModal.style.display = 'flex';
    };
    
    const getDescendantIds = (parentId) => {
        const descendants = new Set();
        const queue = [parentId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            const children = categories.filter(c => c.parentId === currentId);
            children.forEach(child => {
                descendants.add(child.id);
                queue.push(child.id);
            });
        }
        return descendants;
    };

    const closeCategoryModal = () => {
        categoryModal.style.display = 'none';
    };

    // --- Category Management Event Handlers ---
    addCategoryBtn.addEventListener('click', () => openCategoryModal());

    categoryModalCloseBtn.addEventListener('click', closeCategoryModal);
    cancelCategoryEditBtn.addEventListener('click', closeCategoryModal);

    categoryList.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-category-btn');
        if (editBtn) {
            openCategoryModal(editBtn.dataset.id);
            return;
        }

        const deleteBtn = e.target.closest('.delete-category-btn');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const category = categories.find(c => c.id === id);
            const isParent = categories.some(c => c.parentId === id);
            let confirmMessage = `确定要删除栏目 "${category.name}" 吗?`;
            if (isParent) {
                confirmMessage += "\n\n警告: 此栏目包含子栏目，删除它会使这些子栏目成为顶级栏目。"
            }

            if (confirm(confirmMessage)) {
                deleteCategory(id);
            }
        }
    });

    // DnD for categories
    let draggedItem = null;
    categoryList.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('category-item')) {
            draggedItem = e.target;
            setTimeout(() => {
                draggedItem.classList.add('dragging');
            }, 0);
        }
    });

    categoryList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const container = e.currentTarget;
        const afterElement = getDragAfterElement(container, e.clientY);
        if (draggedItem) {
            if (afterElement == null) {
                container.appendChild(draggedItem);
            } else {
                container.insertBefore(draggedItem, afterElement);
            }
        }
    });
    
    categoryList.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
            saveCategoryOrderBtn.style.display = 'inline-block';
        }
    });
    
    saveCategoryOrderBtn.addEventListener('click', async () => {
        const updates = [];
        let order = 0;
        // This needs to be smarter to handle parent-child relationships
        // For now, we flatten the list and save order.
        // A more robust solution would update parentId on drop.
        const items = Array.from(categoryList.querySelectorAll('.category-item'));
        items.forEach(item => {
            updates.push({ id: item.dataset.id, order: order++ });
        });
        
        try {
            await apiFetch(API_URLS.CATEGORIES, {
                method: 'PUT',
                body: JSON.stringify({ updates })
            });
            saveCategoryOrderBtn.style.display = 'none';
            await loadAdminData();
        } catch (error) {
            alert(`保存栏目顺序失败: ${error.message}`);
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.category-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

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

        // Category Management
        addCategoryBtn.addEventListener('click', () => openCategoryModal());
        categoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = categoryIdInput.value;
            const name = categoryNameInput.value.trim();
            const parentId = categoryParentSelect.value || null;

            if (!name) return alert('栏目名称不能为空');
            if (id && id === parentId) return alert('不能将一个栏目设置为自己的父级栏目。');

            const url = id ? `${API_URLS.CATEGORIES}/${id}` : API_URLS.CATEGORIES;
            const method = id ? 'PUT' : 'POST';

            try {
                await apiFetch(url, { method, body: JSON.stringify({ name, parentId }) });
                closeCategoryModal();
                await loadAdminData();
            } catch (error) {
                alert(`保存栏目失败: ${error.message}`);
            }
        });
        categoryModalCloseBtn.addEventListener('click', closeCategoryModal);
        cancelCategoryEditBtn.addEventListener('click', closeCategoryModal);

        categoryList.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-category-btn');
            if (editBtn) {
                openCategoryModal(editBtn.dataset.id);
                return;
            }

            const deleteBtn = e.target.closest('.delete-category-btn');
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                const category = categories.find(c => c.id === id);
                const isParent = categories.some(c => c.parentId === id);
                let confirmMessage = `确定要删除栏目 "${category.name}" 吗?`;
                if (isParent) {
                    confirmMessage += "\n\n警告: 此栏目包含子栏目，删除它会使这些子栏目成为顶级栏目。"
                }

                if (confirm(confirmMessage)) {
                    deleteCategory(id);
                }
            }
        });
        
        // Drag and Drop
        let draggedItem = null;
        categoryList.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('category-item')) {
                draggedItem = e.target;
                setTimeout(() => {
                    draggedItem.classList.add('dragging');
                }, 0);
            }
        });

        categoryList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const container = e.currentTarget;
            const afterElement = getDragAfterElement(container, e.clientY);
            if (draggedItem) {
                if (afterElement == null) {
                    container.appendChild(draggedItem);
                } else {
                    container.insertBefore(draggedItem, afterElement);
                }
            }
        });
        
        categoryList.addEventListener('dragend', () => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
                saveCategoryOrderBtn.style.display = 'inline-block';
            }
        });
        
        saveCategoryOrderBtn.addEventListener('click', async () => {
            const updates = [];
            let order = 0;
            // This needs to be smarter to handle parent-child relationships
            // For now, we flatten the list and save order.
            // A more robust solution would update parentId on drop.
            const items = Array.from(categoryList.querySelectorAll('.category-item'));
            items.forEach(item => {
                updates.push({ id: item.dataset.id, order: order++ });
            });
            
            try {
                await apiFetch(API_URLS.CATEGORIES, {
                    method: 'PUT',
                    body: JSON.stringify({ updates })
                });
                saveCategoryOrderBtn.style.display = 'none';
                await loadAdminData();
            } catch (error) {
                alert(`保存栏目顺序失败: ${error.message}`);
            }
        });

        // Tool Management
        addToolBtn.addEventListener('click', () => openToolModal());
    };

    // --- Authentication ---
    const checkAuth = async (password) => {
        try {
            const res = await fetch(API_URLS.AUTH_LOGIN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            if (!res.ok) throw new Error('Unauthorized');
            const data = await res.json();
            adminToken = data.token;
            sessionStorage.setItem('adminToken', adminToken);
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
                    showAdminPanel();
                } else {
                    loginError.textContent = '密码错误，请重试。';
                    passwordInput.focus();
                }
            });
        }
    };

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('adminToken');
        adminToken = null;
        showLoginView();
    });

    const showLoginView = () => {
        adminPanel.style.display = 'none';
        loginView.style.display = 'block';
        passwordInput.value = '';
        togglePasswordBtn.innerHTML = eyeIcon;
        sessionStorage.removeItem('adminToken');
        adminToken = null;
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
        if (adminToken && await checkAuthWithToken()) {
            showAdminPanel();
            setupThemeSwitcher();
        } else {
            showLoginView();
        }
        setupEventListeners();
        setupLogin();
    };

    // 新增：用token校验有效性
    const checkAuthWithToken = async () => {
        if (!adminToken) return false;
        try {
            // 任意需要鉴权的API都可
            await apiFetch(API_URLS.SETTINGS);
            return true;
        } catch {
            return false;
        }
    };

    initialize();
}); 