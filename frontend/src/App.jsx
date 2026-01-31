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
  const [showModal, setShowModal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null); // Nuevo estado para efecto visual

  // CONFIGURACIÓN DE ESTILO PARA LAS CATEGORÍAS (NUEVO DISEÑO)
  const cuisineStyles = [
    { name: 'Italiana', icon: '🍝', color: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
    { name: 'Mexicana', icon: '🌮', color: 'linear-gradient(135deg, #f09819 0%, #edde5d 100%)' },
    { name: 'Vegana',   icon: '🥗', color: 'linear-gradient(135deg, #a8ff78 0%, #78ffd6 100%)' },
    { name: 'Japonesa', icon: '🍣', color: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)' },
    { name: 'Americana',icon: '🍔', color: 'linear-gradient(135deg, #3a7bd5 0%, #3a6073 100%)' },
    { name: 'Postres',  icon: '🧁', color: 'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)' },
  ];

  const categoryImages = {
    italiana: "https://images.unsplash.com/photo-1498579150354-977475b7ea0b?auto=format&fit=crop&w=800&q=80",
    mexicana: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
    vegana:   "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
    japonesa: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80",
    americana:"https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80",
    postres:  "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80",
    default:  "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=800&q=80"
  };

  const specificImages = {
    "pasta carbonara": "https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80",
    "pizza margarita": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
    "tacos al pastor": "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80",
    "guacamole tradicional": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Guacomole.jpg/800px-Guacomole.jpg", 
    "curry de garbanzos": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&q=80",
    "buddha bowl": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
    "sushi maki roll": "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=800&q=80",
    "ramen de pollo": "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80",
    "hamburguesa clásica": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
    "costillas bbq": "https://unsplash.com/photos/UeYkqQh4PoI/download?force=true&w=800",
    "tiramisú": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80",
    "cheesecake de fresa": "https://unsplash.com/photos/EvP5OAts3bQ/download?force=true&w=800"
  };

  const getRecipeImage = (recipe) => {
    if (!recipe || !recipe.name) return categoryImages.default;
    const nameKey = recipe.name.toLowerCase().trim();
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
      toast.error("Error de autenticación");
      setLoading(false);
    });
  }, []);

  const fetchRecommendations = async (userId, categoryOverride = null) => {
    try {
      const url = `/recommendations/${userId}` + (categoryOverride ? `?category=${categoryOverride}` : '');
      const resRecs = await axios.get(url, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });
      setRecommendations(resRecs.data);
    } catch (err) {
      console.error("Error cargando recomendaciones", err);
    }
  };

  const fetchData = async (userId) => {
    try {
      const resRecipes = await axios.get('https://ltu-m7011e-5.se/recipes');
      setRecipes(resRecipes.data);
      setFilteredRecipes(resRecipes.data);
      
      // Intentamos recuperar la preferencia actual para marcarla visualmente
      try {
        const userRes = await axios.get(`/users/${userId}`, {
            headers: { Authorization: `Bearer ${keycloak.token}` }
        });
        const savedPref = userRes.data.preference || userRes.data.category;
        if (savedPref) setActiveCategory(savedPref);
      } catch (e) {
        // Silent error
      }

      await fetchRecommendations(userId);
      
    } catch (err) {
      console.error("Error al cargar datos:", err);
    }
  };

  const viewRecipeDetail = (recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleSearch = (e) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);
    const filtered = recipes.filter(r => 
      (r.name && r.name.toLowerCase().includes(term)) || 
      (r.category && r.category.toLowerCase().includes(term))
    );
    setFilteredRecipes(filtered);
  };

  const updatePreferences = async (newPref) => { 
    setActiveCategory(newPref); // Marcamos inmediatamente como activo
    const loadId = toast.loading(`Cambiando a modo ${newPref}...`);
    try {
      await axios.post('/users/preferences', 
        { userId: keycloak.tokenParsed.sub, category: newPref },
        { headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json' } }
      );
      
      await fetchRecommendations(keycloak.tokenParsed.sub, newPref);

      toast.success(`¡Gustos actualizados!`, { id: loadId });
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1000);
    } catch (err) {
      toast.error("Error al actualizar perfil", { id: loadId });
    }
  };

  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      name: formData.get('name'),
      category: formData.get('category'),
      description: formData.get('description')
    };
    try {
      await axios.post('https://ltu-m7011e-5.se/recipes', payload, {
        headers: { 
          Authorization: `Bearer ${keycloak.token}`,
          'Content-Type': 'application/json'
        }
      });
      toast.success("¡Receta publicada!");
      setShowModal(false);
      fetchData(keycloak.tokenParsed.sub);
    } catch (err) {
      toast.error("Error al publicar. Verifica tu conexión.");
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
            placeholder="Buscar recetas..." 
            value={searchTerm}
            onChange={handleSearch}
            className="modern-search-input"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="user-badge">
            <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>ESTUDIANTE</span>
            <span style={{ fontWeight: '800' }}>{username.toUpperCase()}</span>
          </div>
          <button onClick={() => keycloak.logout()} className="logout-btn">SALIR</button>
        </div>
      </header>

      <main style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        
        {/* NUEVA SECCIÓN DE GESTIÓN DE PERFIL (DISEÑO DINÁMICO) */}
        <div style={{ marginBottom: '3rem' }}>
            <h3 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '1.5rem', display:'flex', alignItems:'center', gap:'10px' }}>
                🎭 ¿Qué te apetece hoy? <span style={{fontSize:'0.8rem', opacity:0.6, fontWeight:'normal'}}>(Selecciona tu mood)</span>
            </h3>
            
            <div style={{ 
                display: 'flex', 
                gap: '20px', 
                overflowX: 'auto', 
                paddingBottom: '20px', 
                justifyContent: 'flex-start' 
            }}>
                {cuisineStyles.map((cuisine) => {
                    const isActive = activeCategory === cuisine.name;
                    return (
                        <div 
                            key={cuisine.name} 
                            onClick={() => updatePreferences(cuisine.name)}
                            style={{
                                cursor: 'pointer',
                                minWidth: '100px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '10px',
                                transition: 'all 0.3s ease',
                                transform: isActive ? 'translateY(-5px) scale(1.05)' : 'none',
                                opacity: activeCategory && !isActive ? 0.6 : 1
                            }}
                            className="cuisine-card"
                        >
                            {/* Círculo del icono */}
                            <div style={{
                                width: '70px',
                                height: '70px',
                                borderRadius: '50%',
                                background: cuisine.color,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                fontSize: '2rem',
                                boxShadow: isActive ? `0 0 20px ${cuisine.color}` : '0 5px 15px rgba(0,0,0,0.3)',
                                border: isActive ? '3px solid #fff' : 'none',
                                transition: 'all 0.3s ease'
                            }}>
                                {cuisine.icon}
                            </div>
                            
                            {/* Texto */}
                            <span style={{ 
                                color: isActive ? '#f97316' : '#94a3b8', 
                                fontWeight: isActive ? 'bold' : 'normal',
                                fontSize: '0.9rem'
                            }}>
                                {cuisine.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* SECCIÓN DE RECOMENDACIÓN (VISUALMENTE INTEGRADA) */}
        {recommendations.length > 0 && recommendations[0] !== "Selecciona una categoría para ver tu recomendación." && (
            <div className="glass-panel" style={{ 
                borderLeft: '5px solid #f97316', 
                marginBottom: '3rem',
                background: 'linear-gradient(90deg, rgba(249,115,22,0.1) 0%, rgba(30,41,59,0.5) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div>
                    <h4 style={{ color: '#f97316', margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        ChefMatch Recomienda
                    </h4>
                    <h2 style={{ color: '#fff', margin: '5px 0 0 0', fontSize: '1.8rem' }}>
                        {recommendations[0]}
                    </h2>
                </div>
                <div style={{ fontSize: '3rem', opacity: 0.2 }}>✨</div>
            </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem' }}>Explorar Menú</h2>
          <button onClick={() => setShowModal(true)} className="btn-create">+ Añadir Receta</button>
        </div>

        <div className="recipe-grid">
          {filteredRecipes.map((recipe, index) => (
            <div key={recipe.id || index} className="glass-panel recipe-card">
              <div className="recipe-image-container">
                <img 
                  src={getRecipeImage(recipe)} 
                  alt={recipe.name}
                  className="recipe-img"
                />
                <span className="badge-floating">{recipe.category}</span>
              </div>
              <div style={{ padding: '1.2rem' }}>
                <h4 style={{ fontSize: '1.4rem', color: '#fff' }}>{recipe.name}</h4>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '10px 0', lineHeight: '1.4' }}>
                  {recipe.description 
                    ? (recipe.description.length > 60 ? recipe.description.substring(0, 60) + "..." : recipe.description)
                    : "Haz clic abajo para ver los detalles."
                  }
                </p>
                <button 
                  onClick={() => viewRecipeDetail(recipe)} 
                  className="btn-create" 
                  style={{padding: '8px 15px', fontSize:'0.75rem', marginTop: '5px'}}
                >
                  Ver Receta Completa
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {showModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-box">
            <h3>Nueva Receta</h3>
            <form onSubmit={handleCreateRecipe} style={{marginTop:'1rem'}}>
              <input name="name" placeholder="Título" required className="form-input" />
              <select name="category" className="form-input">
                <option value="Italiana">Italiana</option>
                <option value="Mexicana">Mexicana</option>
                <option value="Vegana">Vegana</option>
                <option value="Japonesa">Japonesa</option>
                <option value="Americana">Americana</option>
                <option value="Postres">Postres</option>
              </select>
              <textarea name="description" placeholder="Breve descripción..." required className="form-input" rows="2" />
              <div style={{display: 'flex', gap: '10px'}}>
                <button type="submit" className="btn-create">Publicar</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-modern">Cancelar</button>
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
              <button 
                onClick={() => setSelectedRecipe(null)} 
                className="btn-modern"
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', fontSize: '1.2rem', padding: '5px 15px' }}
              >
                ✕
              </button>
            </div>
            
            <img 
              src={getRecipeImage(selectedRecipe)} 
              alt={selectedRecipe.name}
              style={{ width: '100%', height: '300px', objectFit: 'cover', borderRadius: '12px', marginBottom: '1.5rem' }}
            />
            
            <p style={{ fontStyle: 'italic', marginBottom: '2rem', color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6' }}>
              {selectedRecipe.description}
            </p>

            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ color: '#fff', borderBottom: '2px solid #f97316', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'inline-block' }}>
                🥘 Ingredientes
              </h4>
              <ul style={{ 
                paddingLeft: '0', 
                listStyle: 'none', 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                gap: '10px' 
              }}>
                {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 ? (
                  selectedRecipe.ingredients.map((ing, i) => (
                    <li key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', color: '#e2e8f0' }}>
                      • {ing}
                    </li>
                  ))
                ) : (
                  <li style={{ color: '#94a3b8' }}>No se especificaron ingredientes detallados.</li>
                )}
              </ul>
            </div>

            <div>
              <h4 style={{ color: '#fff', borderBottom: '2px solid #f97316', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'inline-block' }}>
                📝 Instrucciones Paso a Paso
              </h4>
              <div style={{ 
                color: '#e2e8f0', 
                whiteSpace: 'pre-line', 
                lineHeight: '1.8', 
                background: 'rgba(30, 41, 59, 0.5)', 
                padding: '1.5rem', 
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                {selectedRecipe.instructions || "No hay instrucciones detalladas para esta receta."}
              </div>
            </div>

            <div style={{ marginTop: '2rem', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
              <button onClick={() => setSelectedRecipe(null)} className="btn-create" style={{ padding: '10px 30px' }}>
                Cerrar Receta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;