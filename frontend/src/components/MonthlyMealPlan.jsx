// frontend/src/components/MonthlyMealPlan.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const MonthlyMealPlan = ({ keycloak, activeCategory, recipes }) => {
  const [mealPlan, setMealPlan] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [draggedRecipe, setDraggedRecipe] = useState(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();

  useEffect(() => {
    if (keycloak.tokenParsed) {
      fetchMealPlan();
    }
  }, [currentMonth, currentYear, activeCategory]);

  const fetchMealPlan = async () => {
    setLoading(true);
    try {
      const userId = keycloak.tokenParsed.sub;
      const categoryParam = activeCategory ? `?category=${activeCategory}` : '';
      const response = await axios.get(
        `https://ltu-m7011e-5.se/meal-plans/${userId}/${currentMonth}/${currentYear}${categoryParam}`,
        { headers: { Authorization: `Bearer ${keycloak.token}` } }
      );
      setMealPlan(response.data);
    } catch (error) {
      console.error('Error fetching meal plan:', error);
      toast.error('Error loading meal plan');
    } finally {
      setLoading(false);
    }
  };

  const updateDay = async (dayNumber, mealType, recipe) => {
    try {
      const updateData = {
        [mealType]: {
          recipeId: recipe._id || recipe.id,
          recipeName: recipe.name,
          category: recipe.category
        }
      };

      await axios.put(
        `https://ltu-m7011e-5.se/meal-plans/${mealPlan._id}/day/${dayNumber}`,
        updateData,
        { headers: { Authorization: `Bearer ${keycloak.token}` } }
      );

      // Update local state
      const updatedDays = [...mealPlan.days];
      const dayIndex = updatedDays.findIndex(d => d.dayNumber === dayNumber);
      
      if (dayIndex === -1) {
        updatedDays.push({ dayNumber, ...updateData });
      } else {
        updatedDays[dayIndex] = { ...updatedDays[dayIndex], ...updateData };
      }
      
      setMealPlan({ ...mealPlan, days: updatedDays });
      toast.success(`${recipe.name} added to ${mealType}!`);
    } catch (error) {
      console.error('Error updating day:', error);
      toast.error('Error updating meal plan');
    }
  };

  const clearDay = async (dayNumber) => {
    if (!window.confirm('Clear all meals for this day?')) return;
    
    try {
      await axios.delete(
        `https://ltu-m7011e-5.se/meal-plans/${mealPlan._id}/day/${dayNumber}`,
        { headers: { Authorization: `Bearer ${keycloak.token}` } }
      );
      
      const updatedDays = mealPlan.days.filter(d => d.dayNumber !== dayNumber);
      setMealPlan({ ...mealPlan, days: updatedDays });
      toast.success('Day cleared!');
    } catch (error) {
      console.error('Error clearing day:', error);
      toast.error('Error clearing day');
    }
  };

  const getDayMeals = (dayNumber) => {
    return mealPlan?.days?.find(d => d.dayNumber === dayNumber) || { lunch: null, dinner: null };
  };

  const handleDragStart = (recipe) => {
    setDraggedRecipe(recipe);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, dayNumber, mealType) => {
    e.preventDefault();
    if (draggedRecipe) {
      updateDay(dayNumber, mealType, draggedRecipe);
      setDraggedRecipe(null);
    }
  };

  const changeMonth = (delta) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  if (loading) {
    return <div style={{ color: '#fff', textAlign: 'center', padding: '2rem' }}>Loading meal plan...</div>;
  }

  return (
    <div style={{ marginBottom: '3rem' }}>
      {/* Header with month navigation */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem',
        background: 'rgba(249, 115, 22, 0.1)',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '2px solid rgba(249, 115, 22, 0.3)'
      }}>
        <button 
          onClick={() => changeMonth(-1)} 
          className="btn-modern"
          style={{ padding: '10px 20px' }}
        >
          ← Previous
        </button>
        
        <h2 style={{ 
          color: '#f97316', 
          fontSize: '2rem', 
          margin: 0,
          textAlign: 'center'
        }}>
          📅 {monthNames[currentMonth - 1]} {currentYear}
          {activeCategory && <span style={{ display: 'block', fontSize: '1rem', opacity: 0.8, marginTop: '5px' }}>
            {activeCategory} Menu
          </span>}
        </h2>
        
        <button 
          onClick={() => changeMonth(1)} 
          className="btn-modern"
          style={{ padding: '10px 20px' }}
        >
          Next →
        </button>
      </div>

      {/* Drag and drop instruction */}
      <div className="glass-panel" style={{ 
        padding: '1rem', 
        marginBottom: '1.5rem',
        background: 'rgba(56, 239, 125, 0.1)',
        borderLeft: '4px solid #38ef7d'
      }}>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.9rem' }}>
          💡 <strong>Tip:</strong> Drag recipes from the "Explore Menu" section below and drop them into lunch or dinner slots!
        </p>
      </div>

      {/* Calendar grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, 1fr)', 
        gap: '10px',
        marginBottom: '2rem'
      }}>
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={{ 
            textAlign: 'center', 
            color: '#f97316', 
            fontWeight: 'bold',
            padding: '10px',
            background: 'rgba(249, 115, 22, 0.1)',
            borderRadius: '8px'
          }}>
            {day}
          </div>
        ))}

        {/* Empty cells for days before month starts */}
        {Array.from({ length: firstDayOfMonth }, (_, i) => (
          <div key={`empty-${i}`} style={{ minHeight: '120px' }} />
        ))}

        {/* Calendar days */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const dayNumber = i + 1;
          const meals = getDayMeals(dayNumber);
          const isToday = dayNumber === new Date().getDate() && 
                         currentMonth === new Date().getMonth() + 1 && 
                         currentYear === new Date().getFullYear();

          return (
            <div
              key={dayNumber}
              className="glass-panel"
              style={{
                padding: '8px',
                minHeight: '120px',
                position: 'relative',
                border: isToday ? '2px solid #f97316' : '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onClick={() => setSelectedDay(selectedDay === dayNumber ? null : dayNumber)}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <span style={{ 
                  fontWeight: 'bold', 
                  color: isToday ? '#f97316' : '#fff',
                  fontSize: '1.1rem'
                }}>
                  {dayNumber}
                </span>
                {(meals.lunch || meals.dinner) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearDay(dayNumber); }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: 'none',
                      color: '#fca5a5',
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Lunch slot */}
              <div
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, dayNumber, 'lunch')}
                style={{
                  background: meals.lunch ? 'rgba(56, 239, 125, 0.1)' : 'rgba(255,255,255,0.05)',
                  padding: '6px',
                  borderRadius: '4px',
                  marginBottom: '4px',
                  minHeight: '30px',
                  border: '1px dashed rgba(255,255,255,0.2)'
                }}
              >
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '2px' }}>☀️ LUNCH</div>
                {meals.lunch ? (
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#e2e8f0' }}>
                    {meals.lunch.recipeName}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                    Drop here
                  </div>
                )}
              </div>

              {/* Dinner slot */}
              <div
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, dayNumber, 'dinner')}
                style={{
                  background: meals.dinner ? 'rgba(249, 115, 22, 0.1)' : 'rgba(255,255,255,0.05)',
                  padding: '6px',
                  borderRadius: '4px',
                  minHeight: '30px',
                  border: '1px dashed rgba(255,255,255,0.2)'
                }}
              >
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '2px' }}>🌙 DINNER</div>
                {meals.dinner ? (
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#e2e8f0' }}>
                    {meals.dinner.recipeName}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recipe selector (if a day is selected) */}
      {selectedDay && (
        <div className="glass-panel" style={{ 
          padding: '1.5rem',
          background: 'rgba(30, 41, 59, 0.8)',
          border: '2px solid rgba(249, 115, 22, 0.5)'
        }}>
          <h3 style={{ color: '#f97316', marginBottom: '1rem' }}>
            Quick Add for Day {selectedDay}
          </h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '10px' 
          }}>
            {recipes
              .filter(r => !activeCategory || r.category === activeCategory)
              .slice(0, 8)
              .map((recipe, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => handleDragStart(recipe)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    padding: '10px',
                    borderRadius: '8px',
                    cursor: 'grab',
                    border: '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#fff', marginBottom: '5px' }}>
                    {recipe.name}
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      onClick={() => updateDay(selectedDay, 'lunch', recipe)}
                      className="btn-modern"
                      style={{ fontSize: '0.7rem', padding: '4px 8px', flex: 1 }}
                    >
                      + Lunch
                    </button>
                    <button
                      onClick={() => updateDay(selectedDay, 'dinner', recipe)}
                      className="btn-modern"
                      style={{ fontSize: '0.7rem', padding: '4px 8px', flex: 1 }}
                    >
                      + Dinner
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyMealPlan;
