document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const timelineContainer = document.getElementById('timeline-container');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsContainer = document.getElementById('settings-container');
    const themeBtns = document.querySelectorAll('.theme-btn');
    const htmlEl = document.documentElement;

    // Donate Modal
    const donateModal = document.getElementById('donate-modal');
    const donateLink = document.getElementById('donate-link');
    const donateModalClose = document.querySelector('.donate-modal-close');

    // --- Data Fetching ---
    const fetchData = async () => {
        try {
            const [toolsRes, categoriesRes, settingsRes] = await Promise.all([
                fetch('/api/tools'),
                fetch('/api/categories'),
                fetch('/api/settings')
            ]);
            const tools = await toolsRes.json();
            const categories = await categoriesRes.json();
            const settings = await settingsRes.json();
            
            renderData(tools, categories);
            renderFooter(settings);

        } catch (error) {
            console.error('Failed to fetch data:', error);
            if (timelineContainer) {
                timelineContainer.innerHTML = '<p>Error loading content. Please try again later.</p>';
            }
        }
    };

    // --- Rendering ---
    const renderData = (tools, categories) => {
        if (!timelineContainer) return;
        
        timelineContainer.innerHTML = ''; // Clear existing content
        timelineContainer.className = 'scroll-area'; // The main container is now the scroll area

        const timelineWrapper = document.createElement('div');
        timelineWrapper.className = 'timeline'; // The new wrapper will be the centered timeline

        const toolsByCategory = categories
            .map(category => ({
                ...category,
                tools: tools.filter(tool => tool.categoryId === category.id)
            }))
            .filter(category => category.tools.length > 0);

        toolsByCategory.forEach(category => {
            const toolCardsHTML = category.tools.map(tool => {
                const tagsHTML = tool.tags.map(tag => 
                    `<span class="tag ${getTagClass(tag)}">${tag}</span>`
                ).join('');

                return `
                    <a href="${tool.url}" target="_blank" class="tool-card">
                        <h2>${tool.title}</h2>
                        <div class="tags">${tagsHTML}</div>
                        <p>${tool.description}</p>
                    </a>
                `;
            }).join('');

            const timelineGroup = document.createElement('div');
            timelineGroup.className = 'timeline-group';
            timelineGroup.id = `category-${category.id}`;
            
            timelineGroup.innerHTML = `
                <div class="timeline-group__marker">
                    <h2 class="timeline-group__title" data-scroll-target="category-${category.id}">
                        ${category.name}
                    </h2>
                </div>
                <div class="timeline-group__content">
                    ${toolCardsHTML}
                </div>
            `;
            timelineWrapper.appendChild(timelineGroup);
        });

        timelineContainer.appendChild(timelineWrapper);
    };

    const renderFooter = (settings) => {
        const icpContainer = document.getElementById('icp-container');
        if (icpContainer && settings && settings.icp) {
            if (settings.icpUrl) {
                icpContainer.innerHTML = `<a href="${settings.icpUrl}" target="_blank" rel="noopener noreferrer">${settings.icp}</a>`;
            } else {
                icpContainer.textContent = settings.icp;
            }
        }
    };

    const getTagClass = (tag) => {
        const lowerTag = tag.toLowerCase();
        const mappings = {
            '照片对比': 'color-red',
            '图片处理': 'color-red',
            '自制工具': 'color-blue',
            '开发': 'color-blue',
            'dev': 'color-blue',
            '浏览器插件': 'color-green',
            '效率': 'color-green',
            '排版工具': 'color-yellow',
            '设计': 'color-yellow',
            'svg排版': 'color-yellow',
            '公众号排版': 'color-yellow'
        };
        return mappings[lowerTag] || 'color-gray';
    };

    // --- UI Interactions ---
    const setupEventListeners = () => {
        // Settings Menu Toggle
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (settingsContainer) settingsContainer.classList.toggle('open');
            });
        }
        
        // Category title click-to-scroll
        if (timelineContainer) {
            timelineContainer.addEventListener('click', (e) => {
                const target = e.target.closest('[data-scroll-target]');
                if (target) {
                    const targetId = target.dataset.scrollTarget;
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
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
                
                // Update active button state
                themeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    };

    // Donate Modal
    const openDonateModal = () => {
        donateModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    };

    const closeDonateModal = () => {
        donateModal.classList.remove('open');
        document.body.style.overflow = '';
    };

    donateLink.addEventListener('click', (e) => {
        e.preventDefault();
        openDonateModal();
    });

    donateModalClose.addEventListener('click', closeDonateModal);

    donateModal.addEventListener('click', (e) => {
        if (e.target === donateModal) {
            closeDonateModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && donateModal.classList.contains('open')) {
            closeDonateModal();
        }
    });

    // --- Initialization ---
    const init = () => {
        const savedTheme = localStorage.getItem('theme') || 'light';
        htmlEl.setAttribute('data-theme', savedTheme);
        themeBtns.forEach(btn => {
            if (btn.dataset.theme === savedTheme) {
                btn.classList.add('active');
            }
        });

        fetchData();
        setupEventListeners();
    };

    init();
});
