# 尽玩Space (JimPlay.cn) 网站

这是一个为 `jimplay.cn` 设计的现代化、可扩展的静态网站首页。

## 设计理念

- **风格**: 现代、前卫，参考了苹果 visionOS 的设计语言，注重空间感和层次感。
- **技术**: 使用了 HTML5, CSS3, 和基础 JavaScript。CSS 运用了玻璃拟态 (Glassmorphism) 效果、Flexbox 和 Grid 布局，以实现响应式和动态效果。

## 项目结构

```
.
├── assets/               # 存放图片、图标等媒体资源
├── css/
│   └── style.css         # 主要的样式文件
├── js/
│   └── script.js         # 未来用于交互功能的 JavaScript 文件
└── index.html            # 网站主页
```

## 如何扩展内容

网站的设计考虑了未来的可扩展性。若要添加新的工具或项目链接，只需在 `index.html` 文件中进行简单的修改。

1.  打开 `index.html` 文件。
2.  找到 class 为 `tools-grid` 的 `<section>` 元素。
3.  在内部，有一个 `<!-- 预留位置 -->` 的注释。您可以在该区域复制现有的 `<a href="..." class="tool-card">...</a>` 结构，并修改其中的内容。

**示例：添加一个名为 "新工具" 的卡片**

将以下代码块添加到 `tools-grid` 容器中：

```html
<a href="https://new-tool.jimplay.cn" target="_blank" class="tool-card">
    <div class="tool-card-content">
        <h3>新工具</h3>
        <p>这是新工具的简短描述。</p>
    </div>
    <div class="tool-card-arrow">→</div>
</a>
```

新的卡片会自动适应网格布局，无需修改任何 CSS 代码。 