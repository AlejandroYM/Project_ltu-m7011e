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

  const categoryImages = {
    italiana: "https://images.unsplash.com/photo-1498579150354-977475b7ea0b?auto=format&fit=crop&w=800&q=80",
    mexicana: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
    vegana:   "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
    japonesa: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80",
    default:  "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=800&q=80"
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

  const fetchData = async (userId) => {
    try {
      // Apuntamos directamente al puerto del microservicio de recetas
      const resRecipes = await axios.get('https://ltu-m7011e-5.se/recipes');
      setRecipes(resRecipes.data);
      setFilteredRecipes(resRecipes.data);

      const resRecs = await axios.get(`/recommendations/${userId}`, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });
      setRecommendations(resRecs.data);
    } catch (err) {
      console.error("Error al cargar datos:", err);
    }
  };

  // Función para ver detalles corregida
  const viewRecipeDetail = (recipe) => {
    if (!recipe.description) {
      toast.error("Esta receta no tiene una descripción detallada.");
      return;
    }

    toast(recipe.description, {
      duration: 10000,
      icon: '👨‍🍳',
      style: {
        borderRadius: '15px',
        background: '#1e293b',
        color: '#fff',
        border: '1px solid #f97316',
        padding: '20px',
        fontSize: '15px',
        maxWidth: '450px'
      }
    });
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
    const loadId = toast.loading(`Guardando preferencia...`);
    try {
      await axios.post('/users/preferences', 
        { userId: keycloak.tokenParsed.sub, category: newPref },
        { headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json' } }
      );
      toast.success(`Preferencias actualizadas`, { id: loadId });
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 2000);
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
    // CAMBIO: Usa la URL completa del dominio de producción
    await axios.post('https://ltu-m7011e-5.se/recipes', payload, {
      headers: { 
        Authorization: `Bearer ${keycloak.token}`, // IMPORTANTE: El token
        'Content-Type': 'application/json'
    }
    });
    toast.success("¡Receta publicada!");
    // ...
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
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', marginBottom: '3rem' }}>
          <section className="glass-panel">
            <h3>Gestión de Perfil</h3>
            <div className="category-grid" style={{marginTop:'1rem'}}>
              {['Italiana', 'Mexicana', 'Vegana', 'Japonesa'].map(cat => (
                <button key={cat} onClick={() => updatePreferences(cat)} className="btn-modern">{cat}</button>
              ))}
            </div>
          </section>

          <section className="glass-panel" style={{ borderTop: '4px solid #f97316' }}>
            <h3 style={{ color: '#f97316' }}>✨ Recomendaciones IA</h3>
            <div style={{ marginTop: '1rem' }}>
              {recommendations.length > 0 ? (
                recommendations.map((rec, i) => <div key={i} className="recommendation-chip">{rec}</div>)
              ) : (
                <p style={{ opacity: 0.5 }}>Actualiza tu perfil para recibir sugerencias.</p>
              )}
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem' }}>Explorar Recetas</h2>
          <button onClick={() => setShowModal(true)} className="btn-create">+ Añadir Receta</button>
        </div>

        <div className="recipe-grid">
          {filteredRecipes.map((recipe, index) => (
            <div key={recipe.id || index} className="glass-panel recipe-card">
              <div className="recipe-image-container">
                <img 
                  src={categoryImages[recipe.category?.toLowerCase()] || categoryImages.default} 
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
                    : "Haz clic abajo para ver los detalles de esta preparación."
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
              </select>
              <textarea name="description" placeholder="Instrucciones..." required className="form-input" rows="4" />
              <div style={{display: 'flex', gap: '10px'}}>
                <button type="submit" className="btn-create">Publicar</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-modern">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;