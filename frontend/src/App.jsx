import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Keycloak from 'keycloak-js';
import toast, { Toaster } from 'react-hot-toast'; 
import './App.css';

const keycloak = new Keycloak({
  url: "https://keycloak.ltu-m7011e-5.se", 
  realm: "ChefMatchRealm",
  clientId: "frontend-client",
});

function App() {
  const [authenticated, setAuthenticated] = useState(false); 
  const [recipes, setRecipes] = useState([]);
  const [filteredRecipes, setFilteredRecipes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterTime, setFilterTime] = useState("All");

  const [showModal, setShowModal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);

  // --- WEEKLY MEAL PLAN DATA (TRANSLATED) ---
  const weeklyMealPlans = {
    Italian: [
      { day: 'Monday', lunch: 'Mushroom and Parmesan Risotto', dinner: 'Tomato and Basil Bruschettas' },
      { day: 'Tuesday', lunch: 'Bolognese Beef Lasagna', dinner: 'Caprese Salad with Mozzarella' },
      { day: 'Wednesday', lunch: 'Carbonara Spaghetti', dinner: 'Beef Carpaccio with Arugula' },
      { day: 'Thursday', lunch: 'Gnocchi Pesto Genovese', dinner: 'Classic Minestrone Soup' },
      { day: 'Friday', lunch: 'Neapolitan Margherita Pizza', dinner: 'Melted Provolone with Oregano' },
      { day: 'Saturday', lunch: 'Ossobuco Milanese', dinner: 'Rosemary and Olive Focaccia' },
      { day: 'Sunday', lunch: 'Spinach and Ricotta Ravioli', dinner: 'Cheese and Charcuterie Board' }
    ],
    Mexican: [
      { day: 'Monday', lunch: 'Green Chicken Enchiladas', dinner: 'Aztec Tortilla Soup' },
      { day: 'Tuesday', lunch: 'Tacos al Pastor with Pineapple', dinner: 'Squash Blossom Quesadillas' },
      { day: 'Wednesday', lunch: 'Red Pork Pozole', dinner: 'Chicken Tinga Tostadas' },
      { day: 'Thursday', lunch: 'Cheese Stuffed Peppers', dinner: 'Guacamole with Homemade Chips' },
      { day: 'Friday', lunch: 'Machaca Burritos with Egg', dinner: 'Molletes with Pico de Gallo' },
      { day: 'Saturday', lunch: 'Mole Poblano with Rice', dinner: 'Esquites with Mayo and Chili' },
      { day: 'Sunday', lunch: 'Cochinita Pibil', dinner: 'Oaxacan Tamales' }
    ],
    Vegan: [
      { day: 'Monday', lunch: 'Stewed Lentils with Vegetables', dinner: 'Pumpkin and Ginger Soup' },
      { day: 'Tuesday', lunch: 'Soy and Oat Burger', dinner: 'Quinoa and Avocado Salad' },
      { day: 'Wednesday', lunch: 'Chickpea and Coconut Curry', dinner: 'Vegetarian Spring Rolls' },
      { day: 'Thursday', lunch: 'Whole Wheat Pasta with Lentil Bolognese', dinner: 'Hummus with Carrot Sticks' },
      { day: 'Friday', lunch: 'Buddha Bowl with Marinated Tofu', dinner: 'Cauliflower Crust Pizza' },
      { day: 'Saturday', lunch: 'Falafel with Vegan Yogurt Sauce', dinner: 'Mushroom and Cactus Tacos' },
      { day: 'Sunday', lunch: 'Vegetable Paella', dinner: 'Stuffed Eggplants with Textured Soy' }
    ],
    Japanese: [
      { day: 'Monday', lunch: 'Chicken Teriyaki with Rice', dinner: 'Miso Soup with Tofu' },
      { day: 'Tuesday', lunch: 'Yakisoba (Stir-fried Noodles)', dinner: 'Edamame with Sea Salt' },
      { day: 'Wednesday', lunch: 'Katsudon (Breaded Pork)', dinner: 'Wakame Seaweed Salad' },
      { day: 'Thursday', lunch: 'Miso Pork Ramen', dinner: 'Steamed Vegetable Gyozas' },
      { day: 'Friday', lunch: 'Assorted Sushi (Maki and Nigiri)', dinner: 'Tuna Tataki with Sesame' },
      { day: 'Saturday', lunch: 'Prawn and Vegetable Tempura', dinner: 'Yakitori (Chicken Skewers)' },
      { day: 'Sunday', lunch: 'Japanese Curry with Rice', dinner: 'Okonomiyaki (Japanese Omelette)' }
    ],
    American: [
      { day: 'Monday', lunch: 'Mac & Cheese', dinner: 'Caesar Salad with Chicken' },
      { day: 'Tuesday', lunch: 'New York Style Hot Dogs', dinner: 'Onion Rings and Wings' },
      { day: 'Wednesday', lunch: 'Oven Baked BBQ Ribs', dinner: 'Coleslaw' },
      { day: 'Thursday', lunch: 'Club House Sandwich', dinner: 'Clam Chowder' },
      { day: 'Friday', lunch: 'Double Burger with Bacon', dinner: 'Cheese and Bacon Fries' },
      { day: 'Saturday', lunch: 'Kentucky Style Fried Chicken', dinner: 'Buttered Corn on the Cob' },
      { day: 'Sunday', lunch: 'Meatloaf', dinner: 'Nachos with Chili con Carne' }
    ],
    Desserts: [
      { day: 'Monday', lunch: 'Warm Apple Pie', dinner: 'Yogurt with Honey and Walnuts' },
      { day: 'Tuesday', lunch: 'Chocolate Brownie with Ice Cream', dinner: 'Fruit Skewers' },
      { day: 'Wednesday', lunch: 'Strawberry Cheesecake', dinner: 'Mosaic Jelly' },
      { day: 'Thursday', lunch: 'Classic Tiramisu', dinner: 'Chocolate Chip Cookies' },
      { day: 'Friday', lunch: 'Nutella and Banana Crepes', dinner: 'Chocolate Mousse' },
      { day: 'Saturday', lunch: 'Homemade Glazed Donuts', dinner: 'Vanilla and Oreo Shake' },
      { day: 'Sunday', lunch: 'American Pancakes', dinner: 'Homemade Egg Flan' }
    ]
  };

  const cuisineStyles = [
    { name: 'Italian', icon: '🍝', color: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
    { name: 'Mexican', icon: '🌮', color: 'linear-gradient(135deg, #f09819 0%, #edde5d 100%)' },
    { name: 'Vegan',   icon: '🥗', color: 'linear-gradient(135deg, #a8ff78 0%, #78ffd6 100%)' },
    { name: 'Japanese', icon: '🍣', color: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)' },
    { name: 'American', icon: '🍔', color: 'linear-gradient(135deg, #3a7bd5 0%, #3a6073 100%)' },
    { name: 'Desserts', icon: '🧁', color: 'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)' },
  ];

  const categoryImages = {
    italian: "https://images.unsplash.com/photo-1498579150354-977475b7ea0b?auto=format&fit=crop&w=800&q=80",
    mexican: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
    vegan:   "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
    japanese: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80",
    american: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80",
    desserts: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80",
    default:  "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=800&q=80"
  };

  const getRecipeImage = (recipe) => {
    if (!recipe || !recipe.name) return categoryImages.default;
    // Simple mapping for specific images
    const nameKey = recipe.name.toLowerCase().trim();
    const specificImages = {
        "carbonara pasta": "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80",
        "pasta carbonara": "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80", // Keep spanish just in case
        "margherita pizza": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
        "pizza margarita": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
        "tacos al pastor": "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80",
        "traditional guacamole": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Guacomole.jpg/800px-Guacomole.jpg", 
        "guacamole tradicional": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Guacomole.jpg/800px-Guacomole.jpg",
        "chickpea curry": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&q=80",
        "curry de garbanzos": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&q=80",
        "buddha bowl": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
        "sushi maki roll": "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80",
        "chicken ramen": "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80",
        "ramen de pollo": "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80",
        "classic burger": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
        "hamburguesa clásica": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
        "bbq ribs": "https://unsplash.com/photos/UeYkqQh4PoI/download?force=true&w=800",
        "costillas bbq": "https://unsplash.com/photos/UeYkqQh4PoI/download?force=true&w=800",
        "tiramisu": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80",
        "tiramisú": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80",
        "strawberry cheesecake": "https://unsplash.com/photos/EvP5OAts3bQ/download?force=true&w=800",
        "cheesecake de fresa": "https://unsplash.com/photos/EvP5OAts3bQ/download?force=true&w=800"
    };
    return specificImages[nameKey] || categoryImages[recipe.category?.toLowerCase()] || categoryImages.default;
  };

  useEffect(() => {
    keycloak.init({ 
      onLoad: 'login-required', 
      checkLoginIframe: false,
      pkceMethod: 'S256',
      responseMode: 'query'
    }).then(auth => {
      setAuthenticated(auth);
      if (auth) {
        setUsername(keycloak.tokenParsed.preferred_username || "Chef");
        fetchData(keycloak.tokenParsed.sub).finally(() => setLoading(false));
      }
    }).catch(() => {
      toast.error("Authentication Error");
      setLoading(false);
    });
  }, []);

  const fetchRecommendations = async (userId, categoryOverride = null) => {
    try {
      const url = `/recommendations/${userId}` + (categoryOverride ? `?category=${categoryOverride}` : '');
      const resRecs = await axios.get(url, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });
      // Translate backend response if needed on the fly or ensure backend sends English
      setRecommendations(resRecs.data);
    } catch (err) {
      console.error("Error loading recommendations", err);
    }
  };

  const fetchData = async (userId) => {
    try {
      const resRecipes = await axios.get('https://ltu-m7011e-5.se/recipes');
      setRecipes(resRecipes.data);
      applyFilters(resRecipes.data, searchTerm, filterCategory, filterTime);
      
      try {
        const userRes = await axios.get(`/users/${userId}`, {
            headers: { Authorization: `Bearer ${keycloak.token}` }
        });
        const savedPref = userRes.data.preference || userRes.data.category;
        if (savedPref) setActiveCategory(savedPref);
      } catch (e) {}

      await fetchRecommendations(userId);
    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  const applyFilters = (allRecipes, search, cat, time) => {
    let result = allRecipes;
    if (search) {
      result = result.filter(r => 
        (r.name && r.name.toLowerCase().includes(search)) || 
        (r.category && r.category.toLowerCase().includes(search))
      );
    }
    if (cat !== "All") {
      result = result.filter(r => r.category === cat);
    }
    if (time !== "All") {
      if (time === "Short") result = result.filter(r => r.cookingTime && r.cookingTime <= 30);
      else if (time === "Long") result = result.filter(r => r.cookingTime && r.cookingTime > 30);
    }
    setFilteredRecipes(result);
  };

  const handleSearchChange = (e) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);
    applyFilters(recipes, term, filterCategory, filterTime);
  };

  const handleCategoryFilterChange = (e) => {
    const cat = e.target.value;
    setFilterCategory(cat);
    applyFilters(recipes, searchTerm, cat, filterTime);
  };

  const handleTimeFilterChange = (e) => {
    const time = e.target.value;
    setFilterTime(time);
    applyFilters(recipes, searchTerm, filterCategory, time);
  };

  const viewRecipeDetail = (recipe) => {
    setSelectedRecipe(recipe);
  };

  const updatePreferences = async (newPref) => { 
    setActiveCategory(newPref);
    const loadId = toast.loading(`Creating ${newPref} menu...`);
    try {
      await axios.post('/users/preferences', 
        { userId: keycloak.tokenParsed.sub, category: newPref },
        { headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json' } }
      );
      await fetchRecommendations(keycloak.tokenParsed.sub, newPref);
      toast.success(`Weekly meal plan updated!`, { id: loadId });
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1000);
    } catch (err) {
      toast.error("Error updating profile", { id: loadId });
    }
  };

  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    // Change the text in ingredients to an array 
    const ingredientsText = formData.get('ingredients') || "";
    const ingredientsArray = ingredientsText.split(',').map(item => item.trim());

    const payload = {
      name: formData.get('name'),
      category: formData.get('category'),
      description: formData.get('description'),
      ingredients: ingredientsArray,                // Array of ingredients
      instructions: formData.get('instructions'),   // Detailed instructions
      cookingTime: formData.get('cookingTime')
    };
    try {
      await axios.post('https://ltu-m7011e-5.se/recipes', payload, {
        headers: { 
          Authorization: `Bearer ${keycloak.token}`,
          'Content-Type': 'application/json'
        }
      });
      toast.success("Recipe published!");
      setShowModal(false);
      fetchData(keycloak.tokenParsed.sub);
    } catch (err) {
      toast.error("Error publishing. Check your connection.");
    }
  };

  const handleDeleteRecipe = async (id) => {
    if (!window.confirm("Are you sure you want to delete this recipe?")) return;

    try {
      await axios.delete(`https://ltu-m7011e-5.se/recipes/${id}`, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });

      toast.success("Recipe deleted!");
      setSelectedRecipe(null);
      fetchData(keycloak.tokenParsed.sub);
    } catch (err) {
      console.error(err);
      toast.error("Can't delete the recipe, it might be a static one." );
    }
  };


  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;

  return (
    <div className="app-container">
      <Toaster position="top-right" />

      <header className="main-header">
        <div className="logo-text">ChefMatch</div>
        <div className="header-search">
          <input 
            type="text" 
            placeholder="Search recipes..." 
            value={searchTerm}
            onChange={handleSearchChange}
            className="modern-search-input"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="user-badge">
            <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>STUDENT</span>
            <span style={{ fontWeight: '800' }}>{username.toUpperCase()}</span>
          </div>
          <button onClick={() => keycloak.logout()} className="logout-btn">LOGOUT</button>
        </div>
      </header>

      <main style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        
        {/* CATEGORY SELECTION */}
        <div style={{ marginBottom: '3rem' }}>
            <h3 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '1.5rem', display:'flex', alignItems:'center', gap:'10px' }}>
                🎭 What are you craving today? <span style={{fontSize:'0.8rem', opacity:0.6, fontWeight:'normal'}}>(Select your mood)</span>
            </h3>
            <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '20px', justifyContent: 'flex-start' }}>
                {cuisineStyles.map((cuisine) => {
                    const isActive = activeCategory === cuisine.name;
                    return (
                        <div key={cuisine.name} onClick={() => updatePreferences(cuisine.name)}
                            style={{ cursor: 'pointer', minWidth: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', transition: 'all 0.3s ease', transform: isActive ? 'translateY(-5px) scale(1.05)' : 'none', opacity: activeCategory && !isActive ? 0.6 : 1 }}
                            className="cuisine-card">
                            <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: cuisine.color, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '2rem', boxShadow: isActive ? `0 0 20px ${cuisine.color}` : '0 5px 15px rgba(0,0,0,0.3)', border: isActive ? '3px solid #fff' : 'none', transition: 'all 0.3s ease' }}>
                                {cuisine.icon}
                            </div>
                            <span style={{ color: isActive ? '#f97316' : '#94a3b8', fontWeight: isActive ? 'bold' : 'normal', fontSize: '0.9rem' }}>{cuisine.name}</span>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* SINGULAR RECOMMENDATION */}
        {recommendations.length > 0 && recommendations[0] !== "Select a category to see your recommendation." && (
            <div className="glass-panel" style={{ borderLeft: '5px solid #f97316', marginBottom: '3rem', background: 'linear-gradient(90deg, rgba(249,115,22,0.1) 0%, rgba(30,41,59,0.5) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h4 style={{ color: '#f97316', margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>ChefMatch Recommends</h4>
                    <h2 style={{ color: '#fff', margin: '5px 0 0 0', fontSize: '1.8rem' }}>{recommendations[0]}</h2>
                </div>
                <div style={{ fontSize: '3rem', opacity: 0.2 }}>✨</div>
            </div>
        )}

        {/* --- WEEKLY MEAL PLANNER --- */}
        {activeCategory && weeklyMealPlans[activeCategory] && (
            <div style={{ marginBottom: '3rem' }}>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '1.5rem', borderLeft: '5px solid #38ef7d', paddingLeft: '15px' }}>
                    📅 Your Weekly Plan: <span style={{color:'#38ef7d'}}>{activeCategory}</span>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                    {weeklyMealPlans[activeCategory].map((dayPlan, i) => (
                        <div key={i} className="glass-panel" style={{ padding: '15px', textAlign: 'center', borderTop: '3px solid rgba(255,255,255,0.2)' }}>
                            <h4 style={{ color: '#f97316', margin: '0 0 10px 0', textTransform: 'uppercase', fontSize:'0.9rem' }}>{dayPlan.day}</h4>
                            <div style={{ marginBottom: '10px' }}>
                                <span style={{ fontSize: '0.75rem', opacity: 0.7, display:'block' }}>☀️ LUNCH</span>
                                <span style={{ fontWeight: '600', fontSize:'0.9rem', color:'#e2e8f0' }}>{dayPlan.lunch}</span>
                            </div>
                            <div style={{ borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'10px' }}>
                                <span style={{ fontSize: '0.75rem', opacity: 0.7, display:'block' }}>🌙 DINNER</span>
                                <span style={{ fontWeight: '600', fontSize:'0.9rem', color:'#e2e8f0' }}>{dayPlan.dinner}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* EXPLORE MENU WITH FILTERS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '2rem' }}>Explore Menu</h2>
          <button onClick={() => setShowModal(true)} className="btn-create">+ Add Recipe</button>
        </div>

        <div className="glass-panel" style={{ padding: '1rem', marginBottom: '2rem', display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                <span style={{color:'#cbd5e1'}}>📂 Category:</span>
                <select value={filterCategory} onChange={handleCategoryFilterChange} className="form-input" style={{width:'150px', margin:0, padding:'5px 10px'}}>
                    <option value="All">All</option>
                    <option value="Italian">Italian</option>
                    <option value="Mexican">Mexican</option>
                    <option value="Vegan">Vegan</option>
                    <option value="Japanese">Japanese</option>
                    <option value="American">American</option>
                    <option value="Desserts">Desserts</option>
                </select>
            </div>
            <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                <span style={{color:'#cbd5e1'}}>⏱️ Time:</span>
                <select value={filterTime} onChange={handleTimeFilterChange} className="form-input" style={{width:'150px', margin:0, padding:'5px 10px'}}>
                    <option value="All">All</option>
                    <option value="Short">Short Recipes (≤30m)</option>
                    <option value="Long">Long Recipes (&gt;30m)</option>
                </select>
            </div>
        </div>

        <div className="recipe-grid">
          {filteredRecipes.map((recipe, index) => (
            <div key={recipe.id || index} className="glass-panel recipe-card">
              <div className="recipe-image-container">
                <img src={getRecipeImage(recipe)} alt={recipe.name} className="recipe-img" />
                <span className="badge-floating">{recipe.category}</span>
                <span className="badge-floating" style={{ right:'auto', left:'10px', background:'rgba(0,0,0,0.7)' }}>⏱️ {recipe.cookingTime || 30} min</span>
              </div>
              <div style={{ padding: '1.2rem' }}>
                <h4 style={{ fontSize: '1.4rem', color: '#fff' }}>{recipe.name}</h4>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '10px 0', lineHeight: '1.4' }}>
                  {recipe.description 
                    ? (recipe.description.length > 60 ? recipe.description.substring(0, 60) + "..." : recipe.description)
                    : "Click below to see details."
                  }
                </p>
                <button onClick={() => viewRecipeDetail(recipe)} className="btn-create" style={{padding: '8px 15px', fontSize:'0.75rem', marginTop: '5px'}}>View Full Recipe</button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* MODALS */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-box">
            <h3>New Recipe</h3>
            <form onSubmit={handleCreateRecipe} style={{marginTop:'1rem'}}>
              <input name="name" placeholder="Title" required className="form-input" />
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                  <select name="category" className="form-input">
                    <option value="Italian">Italian</option>
                    <option value="Mexican">Mexican</option>
                    <option value="Vegan">Vegan</option>
                    <option value="Japanese">Japanese</option>
                    <option value="American">American</option>
                    <option value="Desserts">Desserts</option>
                  </select>
                  <input name="cookingTime" type="number" placeholder="Minutes (e.g. 30)" required className="form-input" />
              </div>
              <textarea name="description" placeholder="Short description..." required className="form-input" rows="2" />
              <textarea name="ingredients" placeholder="Ingredients (comma separated)..." required className="form-input" rows="3" />
              <textarea name="instructions" placeholder="Step-by-step instructions..." required className="form-input" rows="5" />
              <div style={{display: 'flex', gap: '10px'}}>
                <button type="submit" className="btn-create">Publish</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-modern">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedRecipe && (
        <div className="modal-overlay">
          <div className="glass-panel modal-box" style={{ maxWidth: '700px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '2rem', color: '#f97316', margin: 0 }}>{selectedRecipe.name}</h3>
              <button onClick={() => setSelectedRecipe(null)} className="btn-modern" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', fontSize: '1.2rem', padding: '5px 15px' }}>✕</button>
            </div>
            <img src={getRecipeImage(selectedRecipe)} alt={selectedRecipe.name} style={{ width: '100%', height: '300px', objectFit: 'cover', borderRadius: '12px', marginBottom: '1.5rem' }} />
            <div style={{display:'flex', gap:'15px', marginBottom:'1.5rem'}}>
                <span style={{background:'rgba(249,115,22,0.2)', color:'#f97316', padding:'5px 10px', borderRadius:'5px', fontWeight:'bold'}}>📂 {selectedRecipe.category}</span>
                <span style={{background:'rgba(255,255,255,0.1)', padding:'5px 10px', borderRadius:'5px'}}>⏱️ {selectedRecipe.cookingTime || 30} min</span>
            </div>
            <p style={{ fontStyle: 'italic', marginBottom: '2rem', color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6' }}>{selectedRecipe.description}</p>
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ color: '#fff', borderBottom: '2px solid #f97316', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'inline-block' }}>🥘 Ingredients</h4>
              <ul style={{ paddingLeft: '0', listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 ? (
                  selectedRecipe.ingredients.map((ing, i) => <li key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', color: '#e2e8f0' }}>• {ing}</li>)
                ) : (<li style={{ color: '#94a3b8' }}>No detailed ingredients specified.</li>)}
              </ul>
            </div>
            <div>
              <h4 style={{ color: '#fff', borderBottom: '2px solid #f97316', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'inline-block' }}>📝 Step-by-Step Instructions</h4>
              <div style={{ color: '#e2e8f0', whiteSpace: 'pre-line', lineHeight: '1.8', background: 'rgba(30, 41, 59, 0.5)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {selectedRecipe.instructions || "No detailed instructions for this recipe."}
              </div>
            </div>


            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>              
              {/* Botón de Borrar (Nuevo) */}
              {/* Solo mostramos el botón si la receta tiene un ID largo de Mongo (no es 1, 2, 3...) */}
              {selectedRecipe._id && typeof selectedRecipe._id === 'string' && selectedRecipe._id.length > 5 ? (
                <button onClick={() => handleDeleteRecipe(selectedRecipe._id)} className="btn-modern" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid #ef4444' }}>
                  Delete Recipe
                </button>
              ) : <div></div>}
                <button onClick={() => setSelectedRecipe(null)} className="btn-create" style={{ padding: '10px 30px' }}>
                  Close Recipe
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;