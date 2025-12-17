import { StoreProfileModule } from './modules/store_profile';
import type {
  MenuOptionGroup,
  MenuOptionItem
} from './modules/store_profile';
import { v4 as uuidv4 } from 'uuid';

class AdminUI {
  private container: HTMLElement;
  private profileModule: StoreProfileModule;
  private selectedCategoryId: string | null = null;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error('Container not found');
    this.container = el;
    this.profileModule = new StoreProfileModule();
  }

  async init() {
    this.container.innerHTML = '<div style="padding:2rem;">Loading profile...</div>';

    try {
      await this.profileModule.initialize();
      this.renderLayout();
      this.updateStagedStatus();
    } catch (e) {
      this.container.innerHTML = `<div style="color:red; padding:2rem;">Error: ${e}</div>`;
    }
  }

  private renderLayout() {
    this.container.innerHTML = `
            <div class="sidebar">
                <div class="sidebar-header">
                    <span>Categories</span>
                    <div>
                        <button class="btn btn-sm" id="btn-history" title="History">🕒</button>
                        <button class="btn btn-sm btn-primary" id="btn-add-cat">+</button>
                    </div>
                </div>
                <div class="category-list" id="category-list"></div>
                <div class="commit-bar">
                    <div style="font-size:0.8rem">
                        Admin Mode
                        <span class="staged-badge" id="staged-badge">Changes Staged</span>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-success" id="btn-commit">Commit</button>
                        <button class="btn btn-sm" id="btn-import" style="background:#555; color:white;" title="Import JSON">⬆</button>
                        <button class="btn btn-sm" id="btn-export" style="background:#555; color:white;" title="Export JSON">⬇</button>
                        <input type="file" id="file-import" accept=".json" style="display:none">
                    </div>
                </div>
            </div>
            <div class="main">
                <div class="main-header">
                    <h2 id="main-title">Select Category</h2>
                    <button class="btn btn-primary" id="btn-add-item" style="display:none;">Add Item</button>
                </div>
                <div class="item-list" id="item-list"></div>
            </div>
            <div class="editor-panel" id="editor-panel"></div>
        `;

    // Event Listeners
    document.getElementById('btn-add-cat')?.addEventListener('click', () => this.addNewCategory());
    document.getElementById('btn-history')?.addEventListener('click', () => this.renderHistory());
    document.getElementById('btn-add-item')?.addEventListener('click', () => this.addNewItem());
    document.getElementById('btn-commit')?.addEventListener('click', () => this.handleCommit());
    document.getElementById('btn-export')?.addEventListener('click', () => this.handleExport());

    // Import Handlers
    const fileInput = document.getElementById('file-import') as HTMLInputElement;
    document.getElementById('btn-import')?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleImport(e));

    this.renderCategories();
  }

  private async handleImport(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const json = e.target?.result as string;
        this.profileModule.importProfile(json);
        alert('Profile imported successfully! Changes are staged.');
        this.updateStagedStatus();
        this.renderCategories();
        this.selectedCategoryId = null;
        const itemsDiv = document.getElementById('item-list');
        const title = document.getElementById('main-title');
        const addBtn = document.getElementById('btn-add-item');
        if (itemsDiv) itemsDiv.innerHTML = '';
        if (title) title.innerText = 'Menu Manager';
        if (addBtn) addBtn.style.display = 'none';
      } catch (err) {
        alert(`Import failed: ${err}`);
      }
      // Reset input so same file can be selected again if needed
      input.value = '';
    };

    reader.readAsText(file);
  }

  private renderCategories() {
    const list = document.getElementById('category-list');
    if (!list) return;

    const categories = this.profileModule.getCategories().sort((a, b) => a.displayOrder - b.displayOrder);

    list.innerHTML = categories.map(cat => `
            <div class="category-item ${this.selectedCategoryId === cat.id ? 'active' : ''}" data-id="${cat.id}">
                <span>${cat.name}</span>
                <button class="btn-sm btn-edit-cat" data-id="${cat.id}">⚙️</button>
            </div>
        `).join('');

    // Listeners
    list.querySelectorAll('.category-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.classList.contains('btn-edit-cat')) {
          this.selectCategory(el.getAttribute('data-id')!);
        }
      });
    });

    list.querySelectorAll('.btn-edit-cat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editCategory(btn.getAttribute('data-id')!);
      });
    });
  }

  private selectCategory(id: string) {
    this.selectedCategoryId = id;
    this.closeEditor();
    this.renderCategories(); // update active class
    this.renderItems();
  }

  private renderItems() {
    const container = document.getElementById('item-list');
    const title = document.getElementById('main-title');
    const addBtn = document.getElementById('btn-add-item');

    if (!container || !title || !addBtn) return;

    if (!this.selectedCategoryId) {
      container.innerHTML = '<div style="color:#999; text-align:center; padding:2rem;">Select a category</div>';
      title.innerText = 'Menu Manager';
      addBtn.style.display = 'none';
      return;
    }

    const category = this.profileModule.getCategory(this.selectedCategoryId);
    if (!category) return;

    title.innerText = category.name;
    addBtn.style.display = 'block';

    container.innerHTML = category.items.map(item => `
            <div class="menu-item-card" data-id="${item.id}">
                <div style="position:absolute; top:5px; right:5px;">
                    <span class="badge ${item.available ? 'badge-success' : 'badge-danger'}" 
                          style="width:10px; height:10px; display:inline-block; border-radius:50%; background:${item.available ? '#4caf50' : '#ccc'}"></span>
                </div>
                <h3>${item.name}</h3>
                <div class="price">${item.price.toLocaleString()}원</div>
                <div style="font-size:0.8rem; color:#666; margin-top:5px;">
                    Options: ${(item.optionGroups || []).length}
                </div>
            </div>
        `).join('');

    container.querySelectorAll('.menu-item-card').forEach(el => {
      el.addEventListener('click', () => {
        this.editItem(el.getAttribute('data-id')!);
      });
    });
  }

  private closeEditor() {
    const panel = document.getElementById('editor-panel');
    if (panel) panel.classList.remove('open');
  }

  // ============ HISTORY VIEW ============ //

  private async renderHistory() {
    const main = document.querySelector('.main');
    if (!main) return;

    // Clear existing content and switch view
    main.innerHTML = `
            <div class="main-header">
                <h2>Commit History</h2>
                <button class="btn" id="btn-close-history">Close History</button>
            </div>
            <div class="timeline" id="history-timeline">
                <div style="text-align:center; padding:2rem;">Loading history...</div>
            </div>
        `;

    document.getElementById('btn-close-history')?.addEventListener('click', () => {
      this.restoreMainView();
    });

    try {
      const history = await this.profileModule.getHistory();
      const container = document.getElementById('history-timeline');
      if (!container) return;

      if (history.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:2rem;">No history found.</div>';
        return;
      }

      container.innerHTML = history.map((entry, index) => `
                <div class="timeline-item">
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <h3 class="commit-msg">${entry.message}</h3>
                            ${index > 0 ? `<button class="btn-rollback" data-id="${entry.commitId}">Rollback to this</button>` : '<span style="font-size:0.8rem; color:green; font-weight:bold;">Current Head</span>'}
                        </div>
                        <div class="commit-meta">
                            <span>🕒 ${new Date(entry.timestamp).toLocaleString()}</span>
                            <span>👤 ${entry.author || 'Unknown'}</span>
                            <span>#${entry.commitId.slice(0, 8)}</span>
                        </div>
                    </div>
                </div>
            `).join('');

      container.querySelectorAll('.btn-rollback').forEach(btn => {
        btn.addEventListener('click', () => this.rollbackToCommit(btn.getAttribute('data-id')!));
      });

    } catch (e) {
      main.innerHTML += `<div style="color:red; padding:1rem;">Failed to load history: ${e}</div>`;
    }
  }

  private async rollbackToCommit(commitId: string) {
    if (!confirm('Are you sure you want to rollback to this commit? Current unsaved changes will be lost.')) return;

    try {
      await this.profileModule.rollback(commitId, 'Admin Rollback');
      alert('Rollback successful!');
      this.updateStagedStatus();
      this.renderCategories(); // refresh data
      this.restoreMainView();
    } catch (e) {
      alert(`Rollback failed: ${e}`);
    }
  }

  private restoreMainView() {
    this.renderLayout(); // Re-render the full layout
    this.updateStagedStatus(); // checks staged status again
    // Note: renderLayout calls renderCategories, but we might lose 'selection'. That's fine.
  }

  // ============ ACTIONS ============ //

  private updateStagedStatus() {
    const changes = this.profileModule.getStagedChanges();
    const badge = document.getElementById('staged-badge');
    if (badge) {
      badge.style.display = changes ? 'inline-block' : 'none';
    }
  }

  private async handleCommit() {
    const changes = this.profileModule.getStagedChanges();
    if (!changes) {
      alert('No changes to commit');
      return;
    }

    const msg = prompt('Enter commit message:', 'Update menu');
    if (!msg) return;

    try {
      await this.profileModule.commitChanges(msg, 'Admin');
      this.updateStagedStatus();
      alert('Changes committed successfully!');
    } catch (e) {
      alert(`Commit failed: ${e}`);
    }
  }

  private handleExport() {
    const json = this.profileModule.exportProfile();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `current.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============ CATEGORY EDITOR ============ //

  private addNewCategory() {
    const name = prompt('New Category Name:');
    if (!name) return;

    this.profileModule.addCategory({
      name,
      displayOrder: this.profileModule.getCategories().length + 1,
      commonOptionGroups: []
    });
    this.renderCategories();
    this.updateStagedStatus();
  }

  private editCategory(id: string) {
    const category = this.profileModule.getCategory(id);
    if (!category) return;

    const panel = document.getElementById('editor-panel');
    if (!panel) return;

    panel.innerHTML = `
            <h3>Edit Category</h3>
            <div class="form-group">
                <label>Name</label>
                <input type="text" class="form-control" id="cat-name" value="${category.name}">
            </div>
            <div class="form-group">
                <label>Display Order</label>
                <input type="number" class="form-control" id="cat-order" value="${category.displayOrder}">
            </div>
            
            <hr>
            <h4>Common Option Groups</h4>
            <div id="cat-common-options"></div>
            <button class="btn btn-sm btn-primary" id="btn-add-cat-opt">Add Group</button>

            <div style="margin-top: 2rem; display:flex; gap:10px;">
                <button class="btn btn-primary" id="btn-save-cat">Save</button>
                <button class="btn btn-danger" id="btn-del-cat">Delete</button>
                <button class="btn" onclick="document.getElementById('editor-panel').classList.remove('open')">Cancel</button>
            </div>
        `;

    this.renderOptionGroupsEditor(category.commonOptionGroups || [], 'cat-common-options');

    panel.classList.add('open');

    // Save
    document.getElementById('btn-save-cat')?.addEventListener('click', () => {
      const name = (document.getElementById('cat-name') as HTMLInputElement).value;
      const order = parseInt((document.getElementById('cat-order') as HTMLInputElement).value);
      const options = this.collectOptionGroupsFromEditor('cat-common-options');

      this.profileModule.updateCategory(id, {
        name,
        displayOrder: order,
        commonOptionGroups: options
      });

      this.updateStagedStatus();
      this.renderCategories();
      this.closeEditor();
      if (this.selectedCategoryId === id) this.renderItems();
    });

    // Delete
    document.getElementById('btn-del-cat')?.addEventListener('click', () => {
      if (confirm(`Delete category "${category.name}"?`)) {
        this.profileModule.removeCategory(id);
        this.updateStagedStatus();
        this.selectedCategoryId = null;
        this.renderCategories();
        this.renderItems();
        this.closeEditor();
      }
    });

    // Add Option Group
    document.getElementById('btn-add-cat-opt')?.addEventListener('click', () => {
      this.addOptionGroupToEditor('cat-common-options');
    });
  }

  // ============ ITEM EDITOR ============ //

  private addNewItem() {
    if (!this.selectedCategoryId) return;
    this.profileModule.addMenuItem(this.selectedCategoryId, {
      name: 'New Item',
      price: 0,
      description: '',
      available: true,
      optionGroups: []
    });
    this.renderItems();
    this.updateStagedStatus();
  }

  private editItem(itemId: string) {
    const item = this.profileModule.getMenuItem(itemId);
    if (!item) return;

    const panel = document.getElementById('editor-panel');
    if (!panel) return;

    // Highlight logic in list? Maybe later.

    panel.innerHTML = `
            <h3>Edit Item</h3>
            <div class="form-group">
                <label>Name</label>
                <input type="text" class="form-control" id="item-name" value="${item.name}">
            </div>
            <div class="form-group">
                <label>Price</label>
                <input type="number" class="form-control" id="item-price" value="${item.price}">
            </div>
            <div class="form-group">
                <label>Image URL</label>
                <input type="text" class="form-control" id="item-img" value="${item.imgUrl || ''}">
            </div>
            <div class="form-group checkbox-group">
                <input type="checkbox" id="item-avail" ${item.available ? 'checked' : ''}>
                <label for="item-avail" style="margin:0">Available</label>
            </div>

            <hr>
            <h4>Option Groups</h4>
            <div id="item-options"></div>
            <button class="btn btn-sm btn-primary" id="btn-add-item-opt">Add Group</button>

            <div style="margin-top: 2rem; display:flex; gap:10px;">
                <button class="btn btn-primary" id="btn-save-item">Save</button>
                <button class="btn btn-danger" id="btn-del-item">Delete</button>
            </div>
        `;

    this.renderOptionGroupsEditor(item.optionGroups || [], 'item-options');
    panel.classList.add('open');

    // Handlers
    document.getElementById('btn-save-item')?.addEventListener('click', () => {
      const name = (document.getElementById('item-name') as HTMLInputElement).value;
      const price = parseInt((document.getElementById('item-price') as HTMLInputElement).value);
      const imgUrl = (document.getElementById('item-img') as HTMLInputElement).value;
      const available = (document.getElementById('item-avail') as HTMLInputElement).checked;
      const options = this.collectOptionGroupsFromEditor('item-options');

      this.profileModule.updateMenuItem(itemId, {
        name, price, imgUrl, available, optionGroups: options
      });

      this.updateStagedStatus();
      this.renderItems();
      this.closeEditor();
    });

    document.getElementById('btn-del-item')?.addEventListener('click', () => {
      if (confirm(`Delete item "${item.name}"?`)) {
        this.profileModule.removeMenuItem(itemId);
        this.updateStagedStatus();
        this.renderItems();
        this.closeEditor();
      }
    });

    document.getElementById('btn-add-item-opt')?.addEventListener('click', () => {
      this.addOptionGroupToEditor('item-options');
    });
  }

  // ============ OPTION EDITOR HELPERS ============ //

  private renderOptionGroupsEditor(groups: MenuOptionGroup[], containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    groups.forEach(group => {
      this.createOptionGroupElement(group, container);
    });
  }

  private createOptionGroupElement(group: MenuOptionGroup, container: HTMLElement) {
    const div = document.createElement('div');
    div.className = 'option-group-editor';
    div.dataset.id = group.id;

    div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <input type="text" class="form-control group-name" value="${group.name}" placeholder="Group Name" style="width:60%">
                <button class="btn-sm btn-danger btn-del-group">✕</button>
            </div>
            <div style="display:flex; gap:10px; font-size:12px; margin-bottom:10px;">
                <label><input type="checkbox" class="group-req" ${group.required ? 'checked' : ''}> Required</label>
                <label><input type="checkbox" class="group-multi" ${group.multiSelect ? 'checked' : ''}> Multi</label>
                <input type="number" class="form-control group-max" value="${group.maxSelections || ''}" placeholder="Max" style="width:50px; padding:2px;">
            </div>
            <div class="option-items-container">
            </div>
            <button class="btn-sm btn-add-opt-item" style="margin-top:5px;">+ Option</button>
        `;

    const itemsContainer = div.querySelector('.option-items-container') as HTMLElement;
    group.items.forEach(item => this.createOptionItemElement(item, itemsContainer));

    // Listeners for this group block
    div.querySelector('.btn-del-group')?.addEventListener('click', () => div.remove());
    div.querySelector('.btn-add-opt-item')?.addEventListener('click', () => {
      this.createOptionItemElement({
        id: uuidv4(),
        name: 'New Option',
        price: 0,
        available: true,
        imgUrl: ''
      }, itemsContainer);
    });

    container.appendChild(div);
  }

  private createOptionItemElement(item: MenuOptionItem, container: HTMLElement) {
    const startId = item.id;
    const div = document.createElement('div');
    div.className = 'option-item-row';
    div.dataset.id = startId; // keep original ID if possible, mostly relevant for tracking

    div.innerHTML = `
            <input type="text" class="form-control item-name" value="${item.name}" placeholder="Opt Name" style="flex:2">
            <input type="text" class="form-control item-img" value="${item.imgUrl || ''}" placeholder="Img URL" style="flex:2">
            <input type="number" class="form-control item-price" value="${item.price}" placeholder="Price" style="flex:1">
            <button class="btn-sm btn-danger btn-del-opt-item">✕</button>
        `;

    div.querySelector('.btn-del-opt-item')?.addEventListener('click', () => div.remove());
    container.appendChild(div);
  }

  private addOptionGroupToEditor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) return;
    this.createOptionGroupElement({
      id: uuidv4(),
      name: 'New Group',
      required: false,
      multiSelect: false,
      items: []
    }, container);
  }

  private collectOptionGroupsFromEditor(containerId: string): MenuOptionGroup[] {
    const container = document.getElementById(containerId);
    if (!container) return [];

    const groups: MenuOptionGroup[] = [];
    container.querySelectorAll('.option-group-editor').forEach((groupEl: any) => {
      const id = groupEl.dataset.id || uuidv4();
      const name = (groupEl.querySelector('.group-name') as HTMLInputElement).value;
      const required = (groupEl.querySelector('.group-req') as HTMLInputElement).checked;
      const multiSelect = (groupEl.querySelector('.group-multi') as HTMLInputElement).checked;
      const maxVal = (groupEl.querySelector('.group-max') as HTMLInputElement).value;
      const maxSelections = maxVal ? parseInt(maxVal) : undefined;

      const items: MenuOptionItem[] = [];
      groupEl.querySelectorAll('.option-item-row').forEach((itemEl: any) => {
        // If it's a new item (no dataset.id or handled upstream), we generate ID.
        // But createOptionItemElement assigns dataset.id.
        // If the user modified the UI and it's a new element, it must have an ID.
        // My createOptionItemElement logic generates ID for new ones.
        const itemId = itemEl.dataset.id || uuidv4(); // fallback
        items.push({
          id: itemId,
          name: (itemEl.querySelector('.item-name') as HTMLInputElement).value,
          imgUrl: (itemEl.querySelector('.item-img') as HTMLInputElement).value,
          price: parseInt((itemEl.querySelector('.item-price') as HTMLInputElement).value) || 0,
          available: true // Default to true for editor simplicity for now
        });
      });

      groups.push({
        id,
        name,
        required,
        multiSelect,
        maxSelections,
        items
      });
    });

    return groups;
  }
}

new AdminUI('app').init();
