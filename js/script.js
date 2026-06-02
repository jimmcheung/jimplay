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

    // --- Utility: Escape HTML to prevent XSS ---
    const escapeHtml = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

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
                timelineContainer.innerHTML = '<p>内容加载失败，请稍后重试。</p>';
            }
        }
    };

    // --- Rendering ---
    const renderData = (categories) => {
        if (!timelineContainer) return;
        
        // Remove skeleton loader
        const skeleton = document.getElementById('skeleton-loader');
        if (skeleton) skeleton.remove();

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
                    const toolCardsHTML = subcat.tools.slice(0, 3).map(tool => createToolCardHTML(tool)).join('');
                    
                    // Don't render subcategory card if it has no tools
                    if (toolCardsHTML.length === 0) return '';
                    
                    return `
                        <div class="subcategory-card">
                            <h3 class="subcategory-title">${escapeHtml(subcat.name)}</h3>
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
                    <h2 class="timeline-group__title" data-scroll-target="category-${escapeHtml(category.id)}">
                        ${escapeHtml(category.name)}
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
            `<span class="tag ${getTagClass(tag)}">${escapeHtml(tag)}</span>`
        ).join('');

        // Video card with thumbnail (original card style, thumbnail at bottom)
        if (tool.type === 'video' && tool.thumbnail) {
            return `
                <a href="javascript:void(0)" class="tool-card tool-card--video" data-embed-url="${escapeHtml(tool.embedUrl || '')}" data-url="${escapeHtml(tool.url)}" data-title="${escapeHtml(tool.title)}" data-desc="${escapeHtml(tool.description)}">
                    <h2>${escapeHtml(tool.title)}</h2>
                    <div class="tags">${tagsHTML}</div>
                    <p>${escapeHtml(tool.description)}</p>
                    <div class="tool-card__media">
                        <img src="${escapeHtml(tool.thumbnail)}" alt="${escapeHtml(tool.title)}" loading="lazy" class="tool-card__thumbnail">
                        <div class="tool-card__play">▶</div>
                    </div>
                </a>
            `;
        }

        // Webpage card with favicon
        if (tool.favicon) {
            return `
                <a href="${escapeHtml(tool.url)}" target="_blank" rel="noopener noreferrer" class="tool-card tool-card--webpage">
                    <div class="tool-card__head">
                        <img src="${escapeHtml(tool.favicon)}" alt="" class="tool-card__favicon" onerror="this.style.display='none'">
                        <h2>${escapeHtml(tool.title)}</h2>
                    </div>
                    <div class="tags">${tagsHTML}</div>
                    <p>${escapeHtml(tool.description)}</p>
                </a>
            `;
        }

        // Default card
        return `
            <a href="${escapeHtml(tool.url)}" target="_blank" rel="noopener noreferrer" class="tool-card">
                <h2>${escapeHtml(tool.title)}</h2>
                <div class="tags">${tagsHTML}</div>
                <p>${escapeHtml(tool.description)}</p>
            </a>
        `;
    };

    const renderFooter = (settings) => {
        const icpContainer = document.getElementById('icp-container');
        if (icpContainer && settings && settings.icp) {
            if (settings.icpUrl) {
                icpContainer.innerHTML = `<a href="${escapeHtml(settings.icpUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(settings.icp)}</a>`;
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
        
        // Video card click → open modal
        if (timelineContainer) {
            timelineContainer.addEventListener('click', (e) => {
                const videoCard = e.target.closest('.tool-card--video');
                if (videoCard) {
                    e.preventDefault();
                    const embedUrl = videoCard.dataset.embedUrl;
                    const url = videoCard.dataset.url;
                    const title = videoCard.dataset.title;
                    const desc = videoCard.dataset.desc;
                    openVideoModal(embedUrl, url, title, desc);
                    return;
                }
                
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

    // --- Video Modal ---
    const videoModal = document.getElementById('video-modal');
    const videoEmbedWrapper = document.getElementById('video-embed-wrapper');
    const videoModalTitle = document.getElementById('video-modal-title');
    const videoModalDesc = document.getElementById('video-modal-desc');
    const videoModalLink = document.getElementById('video-modal-link');

    const openVideoModal = (embedUrl, url, title, desc) => {
        videoEmbedWrapper.innerHTML = '';
        if (embedUrl) {
            videoEmbedWrapper.innerHTML = `<iframe src="${escapeHtml(embedUrl)}" allowfullscreen allow="autoplay; encrypted-media" loading="lazy"></iframe>`;
        }
        videoModalTitle.textContent = title || '';
        videoModalDesc.textContent = desc || '';
        videoModalLink.href = url || '#';
        videoModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    };

    const closeVideoModal = () => {
        videoModal.classList.remove('open');
        videoEmbedWrapper.innerHTML = ''; // Stop video playback
        document.body.style.overflow = '';
    };

    if (videoModal) {
        document.querySelector('.video-modal-close').addEventListener('click', closeVideoModal);
        videoModal.addEventListener('click', (e) => {
            if (e.target === videoModal) closeVideoModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && videoModal.classList.contains('open')) closeVideoModal();
        });
    }

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
        const savedTheme = localStorage.getItem('theme') || 
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
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
