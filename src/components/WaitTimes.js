export class WaitTimes {
  constructor(listContainerId) {
    this.container = document.getElementById(listContainerId);
    this._rendered = {}; // track last-known values to diff before writing
  }

  getColorClass(time) {
    if (time <= 10) return 'text-success';
    if (time <= 20) return 'text-warning';
    return 'text-danger';
  }

  /**
   * Identifies the item with the shortest wait time for AI recommendations.
   * @returns {Object|null}
   */
  getShortestWait() {
    const list = Object.values(this._rendered);
    if (list.length === 0) return null;
    return list.sort((a,b) => a.time - b.time)[0];
  }

  update(times) {
    if (!this.container) return;

    times.forEach(item => {
      this._rendered[item.id] = item; // Store for recommendations
      let li = this.container.querySelector(`[data-wait-id="${item.id}"]`);

      // First render: create the node once
      if (!li) {
        li = document.createElement('li');
        li.className = 'wait-item';
        li.dataset.waitId = item.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'wait-name';
        nameSpan.textContent = item.name;

        const valSpan = document.createElement('span');
        valSpan.className = 'wait-val';

        li.appendChild(nameSpan);
        li.appendChild(valSpan);
        this.container.appendChild(li);
      }

      // Only update the value span if it changed
      const valSpan = li.querySelector('.wait-val');
      const newText  = `${item.time} min`;
      const newClass = `wait-val ${this.getColorClass(item.time)}`;

      if (valSpan.textContent !== newText || valSpan.className !== newClass) {
        valSpan.classList.add('val-updating');
        requestAnimationFrame(() => {
          valSpan.textContent = newText;
          valSpan.className   = newClass;
          setTimeout(() => valSpan.classList.remove('val-updating'), 220);
        });
      }
    });
  }
}
