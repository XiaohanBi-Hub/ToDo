// Initialize
let todos = [];
let archivedTodos = [];
let currentFilter = 'active';

// DOM elements
const todoInput = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const filterButtons = document.querySelectorAll('.filter-btn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const newDayBtn = document.getElementById('newDayBtn');
const menuBtn = document.getElementById('menuBtn');
const dropdownMenu = document.getElementById('dropdownMenu');
const historyBtn = document.getElementById('historyBtn');
const historyModal = document.getElementById('historyModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const historyContent = document.getElementById('historyContent');

// Load todos from storage
function loadTodos() {
  chrome.storage.sync.get(['todos', 'archivedTodos'], (result) => {
    todos = (result.todos || []).map(todo => ({
      ...todo,
      subtasks: todo.subtasks || [],
      expanded: todo.expanded === true ? true : false // Explicitly ensure only true values remain true
    }));
    archivedTodos = result.archivedTodos || [];
    renderTodos();
  });
}

// Save todos to storage
function saveTodos() {
  chrome.storage.sync.set({ 
    todos: todos,
    archivedTodos: archivedTodos 
  }, () => {
    renderTodos();
  });
}

// Add a new todo
function addTodo() {
  const text = todoInput.value.trim();
  if (text === '') {
    todoInput.focus();
    return;
  }

  const todo = {
    id: Date.now(),
    text: text,
    completed: false,
    createdAt: new Date().toISOString(),
    subtasks: [],
    expanded: false
  };

  todos.unshift(todo);
  saveTodos();
  todoInput.value = '';
  todoInput.focus();
}

// Toggle todo completion status
function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    // If completing parent, complete all subtasks
    if (todo.completed && todo.subtasks) {
      todo.subtasks.forEach(subtask => {
        subtask.completed = true;
      });
    }
    saveTodos();
  }
}

// Toggle subtask completion status
function toggleSubtask(parentId, subtaskId) {
  const todo = todos.find(t => t.id === parentId);
  if (todo && todo.subtasks) {
    const subtask = todo.subtasks.find(s => s.id === subtaskId);
    if (subtask) {
      subtask.completed = !subtask.completed;
      // Check if all subtasks are completed to auto-complete parent
      if (subtask.completed && todo.subtasks.every(s => s.completed)) {
        todo.completed = true;
      } else if (!subtask.completed) {
        todo.completed = false;
      }
      saveTodos();
    }
  }
}

// Delete a todo
function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  saveTodos();
}

// Delete a subtask
function deleteSubtask(parentId, subtaskId) {
  const todo = todos.find(t => t.id === parentId);
  if (todo && todo.subtasks) {
    todo.subtasks = todo.subtasks.filter(s => s.id !== subtaskId);
    saveTodos();
  }
}

// Toggle todo expansion (for subtasks)
function toggleTodoExpansion(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.expanded = !todo.expanded;
    saveTodos();
    renderTodos();
  }
}

// Edit todo text
function editTodo(id, newText) {
  const todo = todos.find(t => t.id === id);
  if (todo && newText.trim() !== '') {
    todo.text = newText.trim();
    saveTodos();
  }
}

// Edit subtask text
function editSubtask(parentId, subtaskId, newText) {
  const todo = todos.find(t => t.id === parentId);
  if (todo && todo.subtasks) {
    const subtask = todo.subtasks.find(s => s.id === subtaskId);
    if (subtask && newText.trim() !== '') {
      subtask.text = newText.trim();
      saveTodos();
    }
  }
}

// Add a subtask
function addSubtask(parentId, text) {
  const todo = todos.find(t => t.id === parentId);
  if (todo) {
    if (!todo.subtasks) {
      todo.subtasks = [];
    }
    if (!todo.expanded) {
      todo.expanded = true; // Auto-expand when adding subtask
    }
    const subtask = {
      id: Date.now() + Math.random(), // Ensure unique ID
      text: text.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    todo.subtasks.push(subtask);
    // Mark for focus after render (so user can continue adding subtasks)
    todo._focusSubtaskInput = true;
    saveTodos();
    renderTodos();
  }
}

// Get filtered todos
function getFilteredTodos() {
  switch (currentFilter) {
    case 'active':
      return todos.filter(t => !t.completed);
    case 'completed':
      return todos.filter(t => t.completed);
    default:
      return todos.filter(t => !t.completed);
  }
}

// Render todos list
function renderTodos() {
  const filteredTodos = getFilteredTodos();
  
  if (filteredTodos.length === 0) {
    todoList.style.display = 'none';
    emptyState.classList.add('show');
  } else {
    todoList.style.display = 'block';
    emptyState.classList.remove('show');
  }

  todoList.innerHTML = '';
  
  filteredTodos.forEach(todo => {
    renderTodoItem(todo, false);
  });
}

// Render a single todo item (can be main todo or subtask)
function renderTodoItem(todo, isSubtask = false) {
  const li = document.createElement('li');
  li.className = `todo-item ${todo.completed ? 'completed' : ''} ${isSubtask ? 'subtask' : ''}`;
  li.dataset.id = todo.id;
  
  // Checkbox
  const checkbox = document.createElement('div');
  checkbox.className = `todo-checkbox ${todo.completed ? 'checked' : ''}`;
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isSubtask) {
      toggleSubtask(todo.parentId, todo.id);
    } else {
      toggleTodo(todo.id);
    }
  });
  
  // Expand/collapse button (for all main todos)
  let expandBtn = null;
  if (!isSubtask) {
    expandBtn = document.createElement('button');
    expandBtn.className = `expand-btn ${todo.expanded ? 'expanded' : ''}`;
    
    // Show arrow only if there are subtasks, otherwise show "+" when collapsed
    if (todo.subtasks && todo.subtasks.length > 0) {
      expandBtn.innerHTML = todo.expanded ? '▼' : '▶';
    } else {
      expandBtn.innerHTML = todo.expanded ? '▼' : '+';
    }
    
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // If has subtasks, just toggle expansion
      if (todo.subtasks && todo.subtasks.length > 0) {
        toggleTodoExpansion(todo.id);
      } else {
        // If no subtasks, toggle expansion and focus input
        showAddSubtaskInput(li, todo.id);
      }
    });
  }
  
  // Text container
  const textContainer = document.createElement('div');
  textContainer.className = 'todo-text-container';
  
  const text = document.createElement('span');
  text.className = 'todo-text';
  text.textContent = todo.text;
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    enterEditMode(text, todo, isSubtask);
  });
  
  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'todo-edit-input';
  editInput.style.display = 'none';
  editInput.value = todo.text;
  editInput.addEventListener('blur', () => {
    exitEditMode(text, editInput, todo, isSubtask);
  });
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      exitEditMode(text, editInput, todo, isSubtask);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editInput.value = todo.text;
      exitEditMode(text, editInput, todo, isSubtask);
    }
  });
  
  textContainer.appendChild(text);
  textContainer.appendChild(editInput);
  
  // Action buttons container
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'todo-actions';
  
  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isSubtask) {
      deleteSubtask(todo.parentId, todo.id);
    } else {
      deleteTodo(todo.id);
    }
  });
  
  actionsContainer.appendChild(deleteBtn);
  
  // Assemble the item
  if (expandBtn) li.appendChild(expandBtn);
  li.appendChild(checkbox);
  li.appendChild(textContainer);
  li.appendChild(actionsContainer);
  
  todoList.appendChild(li);
  
  // Render subtasks and input if expanded
  if (!isSubtask && todo.expanded) {
    // Render existing subtasks
    if (todo.subtasks && todo.subtasks.length > 0) {
      todo.subtasks.forEach(subtask => {
        subtask.parentId = todo.id; // Store parent ID for reference
        renderTodoItem(subtask, true);
      });
    }
    
    // Add subtask input field (always shown when expanded)
    const subtaskInputContainer = document.createElement('li');
    subtaskInputContainer.className = 'subtask-input-container';
    subtaskInputContainer.dataset.parentId = todo.id;
    const subtaskInput = document.createElement('input');
    subtaskInput.type = 'text';
    subtaskInput.className = 'subtask-input';
    subtaskInput.placeholder = 'Add subtask...';
    subtaskInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const text = subtaskInput.value.trim();
        if (text !== '') {
          addSubtask(todo.id, text);
          subtaskInput.value = '';
          subtaskInput.focus(); // Keep focus after adding
        }
      }
    });
    subtaskInputContainer.appendChild(subtaskInput);
    
    // Auto-focus if marked
    if (todo._focusSubtaskInput) {
      setTimeout(() => {
        subtaskInput.focus();
        todo._focusSubtaskInput = false; // Clear the flag after focusing
      }, 10);
    }
    
    todoList.appendChild(subtaskInputContainer);
  }
}

// Enter edit mode
function enterEditMode(textElement, todo, isSubtask) {
  const container = textElement.parentElement;
  const input = container.querySelector('.todo-edit-input');
  textElement.style.display = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
}

// Exit edit mode
function exitEditMode(textElement, inputElement, todo, isSubtask) {
  const newText = inputElement.value.trim();
  if (newText !== '' && newText !== todo.text) {
    if (isSubtask) {
      editSubtask(todo.parentId, todo.id, newText);
    } else {
      editTodo(todo.id, newText);
    }
  }
  textElement.style.display = 'block';
  inputElement.style.display = 'none';
}

// Show add subtask input (toggle expansion)
function showAddSubtaskInput(parentLi, parentId) {
  console.log('showAddSubtaskInput called for todo:', parentId);
  const todo = todos.find(t => t.id === parentId);
  if (todo) {
    // Toggle expansion state
    todo.expanded = !todo.expanded;
    
    // If expanding, mark for focus after render
    if (todo.expanded) {
      todo._focusSubtaskInput = true;
    }
    
    saveTodos();
    renderTodos();
  } else {
    console.error('Todo not found:', parentId);
  }
}

// Set filter
function setFilter(filter) {
  currentFilter = filter;
  filterButtons.forEach(btn => {
    if (btn.dataset.filter === filter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderTodos();
}

// Event listeners
addBtn.addEventListener('click', addTodo);

todoInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addTodo();
  }
});

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    setFilter(btn.dataset.filter);
  });
});

exportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exportTodos();
  closeDropdown();
});
importBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  importTodos();
  closeDropdown();
});
newDayBtn.addEventListener('click', startNewDay);
historyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showHistory();
  closeDropdown();
});
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDropdown();
});
closeModalBtn.addEventListener('click', closeHistoryModal);

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    closeDropdown();
  }
});

// Close modal when clicking outside
historyModal.addEventListener('click', (e) => {
  if (e.target === historyModal) {
    closeHistoryModal();
  }
});

// Export todos to JSON file
function exportTodos() {
  const dataStr = JSON.stringify(todos, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `todos-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Import todos from JSON file
function importTodos() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedTodos = JSON.parse(e.target.result);
        if (Array.isArray(importedTodos)) {
          if (confirm(`这将导入 ${importedTodos.length} 个待办事项。是否要替换现有的待办事项？`)) {
            // Normalize imported todos to ensure they have subtasks and expanded fields
            todos = importedTodos.map(todo => ({
              ...todo,
              subtasks: (todo.subtasks || []).map(subtask => ({
                ...subtask
              })),
              expanded: todo.expanded || false
            }));
            saveTodos();
            alert('导入成功！');
          }
        } else {
          alert('导入失败：文件格式不正确');
        }
      } catch (error) {
        alert('导入失败：文件格式错误');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Start a new day - archive all current todos and clear the list
function startNewDay() {
  // Add current todos to archived list with archive date
  const archiveDate = new Date().toISOString();
  const todosToArchive = todos.map(todo => ({
    ...todo,
    archivedAt: archiveDate
  }));
  
  // Prepend to archived list (newest first)
  archivedTodos = [...todosToArchive, ...archivedTodos];
  
  // Clear current todos
  todos = [];
  
  // Save to storage
  saveTodos();
  
  // Reset filter to 'all'
  setFilter('all');
}

// Dropdown menu functions
function toggleDropdown() {
  dropdownMenu.classList.toggle('show');
}

function closeDropdown() {
  dropdownMenu.classList.remove('show');
}

// History modal functions
function showHistory() {
  renderHistory();
  historyModal.style.display = 'block';
}

function closeHistoryModal() {
  historyModal.style.display = 'none';
}

function renderHistory() {
  if (archivedTodos.length === 0) {
    historyContent.innerHTML = '<div class="empty-history"><p>暂无历史记录</p></div>';
    return;
  }

  // Group todos by archive date
  const grouped = {};
  archivedTodos.forEach(todo => {
    const date = new Date(todo.archivedAt);
    // Use ISO date string as key for sorting, then format for display
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const displayDate = date.toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        displayDate: displayDate,
        todos: []
      };
    }
    grouped[dateKey].todos.push(todo);
  });

  // Sort dates (newest first)
  const sortedDates = Object.keys(grouped).sort((a, b) => {
    return new Date(b) - new Date(a);
  });

  // Render grouped history
  let html = '';
  sortedDates.forEach(dateKey => {
    const group = grouped[dateKey];
    html += `<div class="history-group">`;
    html += `<div class="history-date">${group.displayDate}</div>`;
    html += `<ul class="history-todo-list">`;
    
    group.todos.forEach(todo => {
      html += `<li class="history-todo-item ${todo.completed ? 'completed' : ''}">`;
      html += `<span class="history-todo-text">${escapeHtml(todo.text)}</span>`;
      if (todo.completed) {
        html += `<span class="history-status completed">completed</span>`;
      } else {
        html += `<span class="history-status active">active</span>`;
      }
      html += `</li>`;
    });
    
    html += `</ul></div>`;
  });

  historyContent.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
loadTodos();

