import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// FIX Bug 3: recibe getValidToken como prop desde App.jsx
const MonthlyMealPlan = ({ keycloak, activeCategory, recipes, onRecipeClick, getValidToken }) => {
  const [mealPlan, setMealPlan]           = useState(null);
  const [currentMonth, setCurrentMonth]   = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear]     = useState(new Date().getFullYear());
  const [loading, setLoading]             = useState(true);
  const [selectedDay, setSelectedDay]     = useState(null);
  const [draggedRecipe, setDraggedRecipe] = useState(null);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const daysInMonth     = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();

  useEffect(() => {
    if (keycloak.tokenParsed) fetchMealPlan();
  }, [currentMonth, currentYear, activeCategory]);

  const fetchMealPlan = async () => {
    setLoading(true);
    try {
      // FIX Bug 3: usar token fresco en vez de keycloak.token directamente
      const token = getValidToken
        ? await getValidToken()
        : keycloak.token;

      const userId   = keycloak.tokenParsed.sub;
      const catParam = activeCategory ? `?category=${activeCategory}` : '';
      const res = await axios.get(
        `https://ltu-m7011e-5.se/meal-plans/${userId}/${currentMonth}/${currentYear}${catParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMealPlan(res.data);
    } catch (err) {
      console.error('fetchMealPlan error:', err.response?.status, err.response?.data || err.message);
      toast.error('Error loading meal plan');
    } finally {
      setLoading(false);
    }
  };

  const handleRecipeClick = (recipeName) => {
    if (!onRecipeClick || !recipeName) return;
    const full = recipes.find(r => r.name?.toLowerCase().trim() === recipeName.toLowerCase().trim());
    if (full) {
      onRecipeClick(full);
    } else {
      onRecipeClick({
        name: recipeName,
        category: activeCategory || 'Unknown',
        description: 'This recipe is part of your meal plan.',
        ingredients: [],
        instructions: 'No detailed instructions available.'
      });
    }
  };

  const updateDay = async (dayNumber, mealType, recipe) => {
    try {
      const token = getValidToken ? await getValidToken() : keycloak.token;
      const data = {
        [mealType]: { recipeId: recipe._id || recipe.id, recipeName: recipe.name, category: recipe.category }
      };
      await axios.put(
        `https://ltu-m7011e-5.se/meal-plans/${mealPlan._id}/day/${dayNumber}`,
        data,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updatedDays = [...mealPlan.days];
      const idx = updatedDays.findIndex(d => d.dayNumber === dayNumber);
      if (idx === -1) updatedDays.push({ dayNumber, ...data });
      else updatedDays[idx] = { ...updatedDays[idx], ...data };
      setMealPlan({ ...mealPlan, days: updatedDays });
      toast.success(`${recipe.name} added to ${mealType}!`);
    } catch (err) {
      console.error('updateDay error:', err.response?.status, err.response?.data || err.message);
      toast.error('Error updating meal plan');
    }
  };

  const clearDay = async (dayNumber) => {
    if (!window.confirm('Clear all meals for this day?')) return;
    try {
      const token = getValidToken ? await getValidToken() : keycloak.token;
      await axios.delete(
        `https://ltu-m7011e-5.se/meal-plans/${mealPlan._id}/day/${dayNumber}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMealPlan({ ...mealPlan, days: mealPlan.days.filter(d => d.dayNumber !== dayNumber) });
      toast.success('Day cleared!');
    } catch (err) {
      console.error('clearDay error:', err.response?.status, err.response?.data || err.message);
      toast.error('Error clearing day');
    }
  };

  const getDayMeals = (n) => mealPlan?.days?.find(d => d.dayNumber === n) || { lunch: null, dinner: null };

  const handleDragStart = (recipe) => setDraggedRecipe(recipe);
  const handleDragOver  = (e) => e.preventDefault();
  const handleDrop = (e, dayNumber, mealType) => {
    e.preventDefault();
    if (draggedRecipe) { updateDay(dayNumber, mealType, draggedRecipe); setDraggedRecipe(null); }
  };

  const changeMonth = (delta) => {
    let m = currentMonth + delta, y = currentYear;
    if (m > 12) { m = 1; y++; } else if (m < 1) { m = 12; y--; }
    setCurrentMonth(m); setCurrentYear(y);
  };

  if (loading) return (
    <div style={{
      padding: '28px 36px',
      borderBottom: '2px solid #d8d0c4',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '0.75rem',
      color: '#8c7d6e',
      letterSpacing: '0.1em',
      textTransform: 'uppercase'
    }}>
      Loading meal plan…
    </div>
  );

  return (
    <div style={{ borderBottom: '2px solid #1a1410' }}>

      {/* ── HEADER BAR ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'stretch',
        borderBottom: '2px solid #1a1410',
        background: '#ede8e0'
      }}>
        {/* Prev */}
        <button
          onClick={() => changeMonth(-1)}
          style={{
            padding: '16px 28px',
            background: 'transparent',
            border: 'none',
            borderRight: '1px solid #d8d0c4',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.72rem',
            color: '#8c7d6e',
            cursor: 'pointer',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1a1410'; e.currentTarget.style.color = '#f2ede6'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8c7d6e'; }}
        >
          ← Prev
        </button>

        {/* Title */}
        <div style={{ textAlign: 'center', padding: '14px 40px', flex: 1 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '2rem',
            color: '#1a1410',
            letterSpacing: '0.06em',
            lineHeight: 1
          }}>
            {monthNames[currentMonth - 1]} {currentYear}
          </div>
          {activeCategory && (
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.62rem',
              color: '#c45c35',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginTop: '4px'
            }}>
              {activeCategory} menu
            </div>
          )}
        </div>

        {/* Tip */}
        <div style={{
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          borderLeft: '1px solid #d8d0c4',
          borderRight: '1px solid #d8d0c4',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.62rem',
          color: '#8c7d6e',
          maxWidth: '240px',
          letterSpacing: '0.04em'
        }}>
          Drag recipes from Explore Menu into lunch/dinner slots
        </div>

        {/* Next */}
        <button
          onClick={() => changeMonth(1)}
          style={{
            padding: '16px 28px',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid #d8d0c4',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.72rem',
            color: '#8c7d6e',
            cursor: 'pointer',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1a1410'; e.currentTarget.style.color = '#f2ede6'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8c7d6e'; }}
        >
          Next →
        </button>
      </div>

      {/* ── CALENDAR ── */}
      <div style={{ padding: '0 0 2px 0' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #d8d0c4' }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} style={{
              padding: '10px',
              textAlign: 'center',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.6rem',
              color: '#c45c35',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              borderRight: '1px solid #d8d0c4',
              background: '#ede8e0'
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {/* Empty offset cells */}
          {Array.from({ length: firstDayOfMonth }, (_, i) => (
            <div key={`e-${i}`} style={{
              minHeight: '110px',
              borderRight: '1px solid #d8d0c4',
              borderBottom: '1px solid #d8d0c4',
              background: '#f8f5f0'
            }} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const meals = getDayMeals(day);
            const isToday = day === new Date().getDate() &&
              currentMonth === new Date().getMonth() + 1 &&
              currentYear === new Date().getFullYear();

            return (
              <div
                key={day}
                style={{
                  minHeight: '110px',
                  borderRight: '1px solid #d8d0c4',
                  borderBottom: '1px solid #d8d0c4',
                  background: isToday ? '#fff7f4' : '#f2ede6',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  borderLeft: isToday ? '3px solid #c45c35' : 'none',
                  position: 'relative'
                }}
                onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                onMouseEnter={e => !isToday && (e.currentTarget.style.background = '#ede8e0')}
                onMouseLeave={e => !isToday && (e.currentTarget.style.background = '#f2ede6')}
              >
                {/* Day number */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px 4px 8px'
                }}>
                  <span style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: '1.2rem',
                    color: isToday ? '#c45c35' : '#1a1410',
                    lineHeight: 1
                  }}>
                    {day}
                  </span>
                  {(meals.lunch || meals.dinner) && (
                    <button
                      onClick={e => { e.stopPropagation(); clearDay(day); }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #d8d0c4',
                        color: '#8c7d6e',
                        fontSize: '0.55rem',
                        padding: '2px 6px',
                        cursor: 'pointer',
                        fontFamily: "'IBM Plex Mono', monospace",
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase'
                      }}
                    >clr</button>
                  )}
                </div>

                {/* LUNCH slot */}
                <div
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, day, 'lunch')}
                  style={{
                    margin: '0 6px 4px 6px',
                    padding: '5px 7px',
                    background: meals.lunch ? 'rgba(196,92,53,0.08)' : 'rgba(216,208,196,0.3)',
                    border: `1px dashed ${meals.lunch ? '#c45c35' : '#d8d0c4'}`,
                    minHeight: '28px'
                  }}
                >
                  <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: '0.52rem', color: '#8c7d6e', letterSpacing: '0.1em', marginBottom: '2px' }}>☀ LUNCH</div>
                  {meals.lunch ? (
                    <div
                      onClick={e => { e.stopPropagation(); handleRecipeClick(meals.lunch.recipeName); }}
                      style={{
                        fontFamily: "'IBM Plex Mono'", fontSize: '0.62rem', fontWeight: '700',
                        color: '#c45c35', cursor: 'pointer', textDecoration: 'underline dotted',
                        textDecorationColor: 'rgba(196,92,53,0.4)', lineHeight: 1.3
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
                      onMouseLeave={e => e.currentTarget.style.color = '#c45c35'}
                    >
                      {meals.lunch.recipeName}
                    </div>
                  ) : (
                    <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: '0.58rem', color: '#d8d0c4', fontStyle: 'italic' }}>drop here</div>
                  )}
                </div>

                {/* DINNER slot */}
                <div
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, day, 'dinner')}
                  style={{
                    margin: '0 6px 6px 6px',
                    padding: '5px 7px',
                    background: meals.dinner ? 'rgba(232,168,124,0.12)' : 'rgba(216,208,196,0.3)',
                    border: `1px dashed ${meals.dinner ? '#e8a87c' : '#d8d0c4'}`,
                    minHeight: '28px'
                  }}
                >
                  <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: '0.52rem', color: '#8c7d6e', letterSpacing: '0.1em', marginBottom: '2px' }}>🌙 DINNER</div>
                  {meals.dinner ? (
                    <div
                      onClick={e => { e.stopPropagation(); handleRecipeClick(meals.dinner.recipeName); }}
                      style={{
                        fontFamily: "'IBM Plex Mono'", fontSize: '0.62rem', fontWeight: '700',
                        color: '#e8a87c', cursor: 'pointer', textDecoration: 'underline dotted',
                        textDecorationColor: 'rgba(232,168,124,0.4)', lineHeight: 1.3
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
                      onMouseLeave={e => e.currentTarget.style.color = '#e8a87c'}
                    >
                      {meals.dinner.recipeName}
                    </div>
                  ) : (
                    <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: '0.58rem', color: '#d8d0c4', fontStyle: 'italic' }}>drop here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── QUICK ADD PANEL ── */}
      {selectedDay && (
        <div style={{
          borderTop: '2px solid #1a1410',
          background: '#ede8e0',
          padding: '20px 28px'
        }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '1.4rem',
            color: '#1a1410',
            letterSpacing: '0.06em',
            marginBottom: '14px'
          }}>
            QUICK ADD — DAY {selectedDay}
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: '0.62rem', color: '#8c7d6e', marginLeft: '12px', letterSpacing: '0.1em' }}>
              (drag or click + Lunch / + Dinner)
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '8px'
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
                    padding: '10px 12px',
                    border: '1px solid #d8d0c4',
                    background: '#f2ede6',
                    cursor: 'grab',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fff7f4'; e.currentTarget.style.borderColor = '#c45c35'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f2ede6'; e.currentTarget.style.borderColor = '#d8d0c4'; }}
                >
                  <div style={{
                    fontFamily: "'IBM Plex Mono'", fontWeight: '700',
                    fontSize: '0.75rem', color: '#1a1410', marginBottom: '8px', lineHeight: 1.3
                  }}>
                    {recipe.name}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => updateDay(selectedDay, 'lunch', recipe)}
                      style={{
                        flex: 1, padding: '5px 0',
                        background: 'transparent', border: '1px solid #c45c35',
                        color: '#c45c35', fontFamily: "'IBM Plex Mono'",
                        fontSize: '0.6rem', letterSpacing: '0.08em',
                        textTransform: 'uppercase', cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#c45c35'; e.currentTarget.style.color = '#f2ede6'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#c45c35'; }}
                    >
                      + Lunch
                    </button>
                    <button
                      onClick={() => updateDay(selectedDay, 'dinner', recipe)}
                      style={{
                        flex: 1, padding: '5px 0',
                        background: 'transparent', border: '1px solid #e8a87c',
                        color: '#e8a87c', fontFamily: "'IBM Plex Mono'",
                        fontSize: '0.6rem', letterSpacing: '0.08em',
                        textTransform: 'uppercase', cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#e8a87c'; e.currentTarget.style.color = '#f2ede6'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#e8a87c'; }}
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
