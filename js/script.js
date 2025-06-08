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
            const res = await fetch('/api/all-data');
            if (!res.ok) {
                throw new Error(`API request failed with status ${res.status}`);
            }
            const data = await res.json();
            
            renderData(data.categories || []);
            renderFooter(data.settings || {});

        } catch (error) {
            console.error('Failed to fetch data:', error);
            if (timelineContainer) {
                timelineContainer.innerHTML = '<p>Error loading content. Please try again later.</p>';
            }
        }
    };

    // --- Rendering ---
    const renderData = (categories) => {
        if (!timelineContainer) return;
        
        timelineContainer.innerHTML = ''; // Clear existing content
        timelineContainer.className = 'scroll-area';

        const timelineWrapper = document.createElement('div');
        timelineWrapper.className = 'timeline';

        categories.forEach(category => {
            const timelineGroup = document.createElement('div');
            timelineGroup.className = 'timeline-group';
            timelineGroup.id = `category-${category.id}`;
            
            let contentHTML = '';

            // Render tools directly under the main category
            if (category.tools && category.tools.length > 0) {
                contentHTML += category.tools.map(tool => createToolCardHTML(tool)).join('');
            }

            // Render subcategories, each with its own set of tools
            if (category.subcategories && category.subcategories.length > 0) {
                contentHTML += category.subcategories.map(subcat => {
                    const toolCardsHTML = subcat.tools.map(tool => createToolCardHTML(tool)).join('');
                    
                    // Don't render subcategory card if it has no tools
                    if (toolCardsHTML.length === 0) return '';
                    
                    return `
                        <div class="subcategory-card">
                            <h3 class="subcategory-title">${subcat.name}</h3>
                            <div class="tool-grid">
                                ${toolCardsHTML}
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            // Only render the main category group if it has content
            if (contentHTML.trim() === '') return;

            timelineGroup.innerHTML = `
                <div class="timeline-group__marker">
                    <h2 class="timeline-group__title" data-scroll-target="category-${category.id}">
                        ${category.name}
                    </h2>
                </div>
                <div class="timeline-group__content">
                    ${contentHTML}
                </div>
            `;
            timelineWrapper.appendChild(timelineGroup);
        });

        timelineContainer.appendChild(timelineWrapper);
    };
    
    const createToolCardHTML = (tool) => {
        const tagsHTML = (tool.tags || []).map(tag => 
            `<span class="tag ${getTagClass(tag)}">${tag}</span>`
        ).join('');

        return `
            <a href="${tool.url}" target="_blank" class="tool-card">
                <h2>${tool.title}</h2>
                <div class="tags">${tagsHTML}</div>
                <p>${tool.description}</p>
            </a>
        `;
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

    const TAG_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'indigo', 'cyan', 'orange'];

    const getTagClass = (tag) => {
        // Simple hash function to get a consistent color for a tag
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash += tag.charCodeAt(i);
        }
        const colorIndex = hash % TAG_COLORS.length;
        return `color-${TAG_COLORS[colorIndex]}`;
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
