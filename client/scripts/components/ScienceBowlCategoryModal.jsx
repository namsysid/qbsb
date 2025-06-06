const SBCATEGORY_BUTTONS = [
  ['MATH', 'primary'],
  ['PHYSICS', 'danger'],
  ['CHEMISTRY', 'warning'],
  ['BIOLOGY', 'success'],
  ['EARTH AND SPACE', 'info'],
  ['ENERGY', 'secondary']
];

function ScienceBowlCategoryModal({ categoryManager, disablePercentView = false, onClose = () => {} }) {
  console.log('ScienceBowlCategoryModal rendering with categories:', categoryManager.categories);
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    console.log('ScienceBowlCategoryModal useEffect running');
    // Add modal event listeners
    const modal = document.getElementById('category-modal-root');
    if (modal) {
      console.log('Found modal element in React component');
      const handleShow = () => {
        console.log('Modal shown in React component');
        setIsVisible(true);
        modal.removeAttribute('inert');
        categoryManager.loadCategoryModal();
      };
      const handleHide = () => {
        console.log('Modal hidden in React component');
        setIsVisible(false);
        modal.setAttribute('inert', '');
        onClose();
      };

      modal.addEventListener('show.bs.modal', handleShow);
      modal.addEventListener('hidden.bs.modal', handleHide);

      return () => {
        modal.removeEventListener('show.bs.modal', handleShow);
        modal.removeEventListener('hidden.bs.modal', handleHide);
      };
    } else {
      console.log('Modal element not found in React component');
    }
  }, [onClose, categoryManager]);

  function ToggleAllButton() {
    console.log('ToggleAllButton rendering');
    function handleClick(e) {
      console.log('Toggle all clicked. Current categories:', categoryManager.categories);
      e.preventDefault(); // Add this to prevent any default behavior
      if (categoryManager.categories.length === 0) {
        categoryManager.import({
          categories: SBCATEGORY_BUTTONS.map(element => element[0])
        });
      } else {
        categoryManager.import();
      }
      categoryManager.loadCategoryModal();
      onClose();
    }
    return (
      <button className='btn btn-primary me-1' id='toggle-all' onClick={handleClick}>Toggle all</button>
    );
  }

  function TogglePercentView() {
    console.log('TogglePercentView rendering');
    function handleClick(e) {
      console.log('Percent view clicked. Current categories:', categoryManager.categories);
      e.preventDefault(); // Add this to prevent any default behavior
      categoryManager.percentView = !categoryManager.percentView;
      categoryManager.loadCategoryModal();
      onClose();
    }
    return (
      <button className='btn btn-primary' onClick={handleClick}>% view</button>
    );
  }

  function CategoryButton({ category, color }) {
    console.log('CategoryButton rendering for:', category);
    function handleClick(e) {
      console.log('Category button clicked:', category);
      e.preventDefault(); // Add this to prevent any default behavior
      categoryManager.updateCategory(category);
      categoryManager.loadCategoryModal();
      onClose();
    }

    return (
      <div>
        <input 
          type='checkbox' 
          className='btn-check' 
          autoComplete='off' 
          id={category} 
          checked={categoryManager.categories.includes(category)}
          onClick={handleClick}
        />
        <label className={`btn btn-outline-${color} w-100 rounded-0 my-1`} htmlFor={category}>
          {category}<br />
        </label>
      </div>
    );
  }

  console.log('Rendering modal with categories:', categoryManager.categories);
  return (
    <div className='modal fade' id='category-modal-root' tabIndex='-1' aria-labelledby='category-modal-label'>
      <div className='modal-dialog modal-dialog-scrollable'>
        <div className='modal-content'>
          <div className='modal-header'>
            <h5 className='modal-title me-2' id='category-modal-label'>Select Categories</h5>
            <ToggleAllButton />
            {!disablePercentView && <TogglePercentView />}
            <button type='button' className='btn-close' data-bs-dismiss='modal' aria-label='Close'></button>
          </div>
          <div className='modal-body'>
            <div className='row' id='non-percent-view'>
              <div className='col-12' id='categories'>
                <h5 className='text-center'>Category</h5>
                {SBCATEGORY_BUTTONS.map(([category, color]) => (
                  <CategoryButton key={category} category={category} color={color} />
                ))}
              </div>
            </div>
            <div className='row d-none' id='percent-view'>
              <div className='col-12'>
                <table className='table'>
                  <tbody>
                    {SBCATEGORY_BUTTONS.map(([category, color], index) => (
                      <tr key={category}>
                        <th style={{ width: '50%' }}>{category}</th>
                        <td style={{ width: '50%' }}>
                          <span className='font-monospace me-1 category-percent'>
                            {String(categoryManager.categoryPercents[index]).padStart(3, '\u00A0')}%
                          </span>
                          <div className='btn-group btn-group-sm me-1' role='group'>
                            <button type='button' className='btn btn-outline-secondary' onClick={() => {
                              categoryManager.categoryPercents[index] = Math.max(0, categoryManager.categoryPercents[index] - 5);
                              categoryManager.loadCategoryModal();
                            }}>-</button>
                            <button type='button' className='btn btn-outline-secondary' onClick={() => {
                              categoryManager.categoryPercents[index] = Math.min(100, categoryManager.categoryPercents[index] + 5);
                              categoryManager.loadCategoryModal();
                            }}>+</button>
                          </div>
                          <div className='btn-group btn-group-sm' role='group'>
                            <button type='button' className='btn btn-outline-secondary' onClick={() => {
                              categoryManager.categoryPercents[index] = 0;
                              categoryManager.loadCategoryModal();
                            }}>Min</button>
                            <button type='button' className='btn btn-outline-secondary' onClick={() => {
                              categoryManager.categoryPercents[index] = 50;
                              categoryManager.loadCategoryModal();
                            }}>50%</button>
                            <button type='button' className='btn btn-outline-secondary' onClick={() => {
                              const total = categoryManager.categoryPercents.reduce((a, b) => a + b, 0);
                              categoryManager.categoryPercents[index] = 100 - (total - categoryManager.categoryPercents[index]);
                              categoryManager.loadCategoryModal();
                            }}>Max</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <th>Total Percent:</th>
                      <td className='font-monospace'>
                        <span className='me-1'>
                          {String(categoryManager.categoryPercents.reduce((a, b) => a + b, 0)).padStart(3, '\u00A0')}%
                        </span>
                        <button
                          type='button'
                          className='btn btn-sm btn-outline-secondary'
                          onClick={() => {
                            categoryManager.categoryPercents = categoryManager.categoryPercents.map(() => 0);
                            categoryManager.loadCategoryModal();
                          }}
                        >
                          Reset
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScienceBowlCategoryModal; 