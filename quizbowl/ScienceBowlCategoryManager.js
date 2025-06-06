import { SBCATEGORIES } from './categories.js';

export default class ScienceBowlCategoryManager {
  constructor(categories = []) {
    this.categories = categories;
    this.categoryPercents = new Array(SBCATEGORIES.length).fill(0);
    this.percentView = false;
    console.log('CategoryManager initialized with categories:', this.categories);
  }

  import(data = {}) {
    this.categories = data.categories ?? [];
    this.categoryPercents = data.categoryPercents ?? new Array(SBCATEGORIES.length).fill(0);
    this.percentView = data.percentView ?? false;
    console.log('Categories imported:', this.categories);
  }

  export() {
    const data = {
      categories: this.categories,
      categoryPercents: this.categoryPercents,
      percentView: this.percentView
    };
    console.log('Categories exported:', data.categories);
    return data;
  }

  getRandomCategory() {
    const total = this.categoryPercents.reduce((a, b) => a + b, 0);
    if (total === 0) {
      // uniformly return a random category
      return SBCATEGORIES[Math.floor(Math.random() * SBCATEGORIES.length)];
    }

    let random = Math.random() * total;
    for (let i = 0; i < this.categoryPercents.length; i++) {
      random -= this.categoryPercents[i];
      if (random <= 0) { return SBCATEGORIES[i]; }
    }
  }

  isValidCategory(question) {
    if (this.categories.length === 0) {
      return true;
    }

    return this.categories.includes(question.category);
  }

  loadCategoryModal() {
    console.log('Loading modal with categories:', this.categories);
    // Update checkboxes
    const checkboxes = document.querySelectorAll('#categories input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      checkbox.checked = this.categories.includes(checkbox.id);
    }

    // Update percent view
    document.getElementById('non-percent-view').classList.toggle('d-none', this.percentView);
    document.getElementById('percent-view').classList.toggle('d-none', !this.percentView);
    document.getElementById('toggle-all').disabled = this.percentView;

    // Update percent displays
    const categoryPercentElements = document.querySelectorAll('.category-percent');
    for (let i = 0; i < this.categoryPercents.length; i++) {
      categoryPercentElements.item(i).textContent = String(this.categoryPercents[i]).padStart(3, '\u00A0') + '%';
    }
  }

  updateCategory(category) {
    if (this.categories.includes(category)) {
      this.categories = this.categories.filter(a => a !== category);
      console.log('Category removed:', category, 'New categories:', this.categories);
      return false;
    } else {
      this.categories.push(category);
      console.log('Category added:', category, 'New categories:', this.categories);
      return true;
    }
  }
} 