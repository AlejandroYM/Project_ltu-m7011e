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
  const [showModal, setShowModal] = useState(false); // Modal para crear receta
  const [selectedRecipe, setSelectedRecipe] = useState(null); // Modal para ver detalles

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

  // Función para ver detalles actualizada: Solo activa el estado del modal
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
      await axios.post('https://ltu-m7011e-5.se/recipes', payload, {
        headers: { 
          Authorization: `Bearer ${keycloak.token}`,
          'Content-Type': 'application/json'
        }
      });
      toast.success("¡Receta publicada!");
      setShowModal(false); // Cierra el modal de creación tras el éxito
      fetchData(keycloak.tokenParsed.sub); // Recarga la lista
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

      {/* MODAL PARA CREAR NUEVA RECETA */}
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
              <textarea name="description" placeholder="Breve descripción..." required className="form-input" rows="2" />
              {/* Nota: Para producción, aquí deberías añadir campos para ingredientes e instrucciones en el formulario también */}
              <div style={{display: 'flex', gap: '10px'}}>
                <button type="submit" className="btn-create">Publicar</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-modern">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA VER DETALLES DE RECETA (NUEVO) */}
      {selectedRecipe && (
        <div className="modal-overlay">
          <div className="glass-panel modal-box" style={{ maxWidth: '700px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Cabecera del Modal */}
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
            
            {/* Imagen Principal */}
            <img 
              src={categoryImages[selectedRecipe.category?.toLowerCase()] || categoryImages.default} 
              alt={selectedRecipe.name}
              style={{ width: '100%', height: '300px', objectFit: 'cover', borderRadius: '12px', marginBottom: '1.5rem' }}
            />
            
            {/* Descripción */}
            <p style={{ fontStyle: 'italic', marginBottom: '2rem', color: '#cbd5e1', fontSize: '1.1rem', lineHeight: '1.6' }}>
              {selectedRecipe.description}
            </p>

            {/* Ingredientes */}
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

            {/* Instrucciones */}
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

            {/* Footer del Modal */}
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