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
  const [recommendations, setRecommendations] = useState([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);

  // Mapeo manual de imágenes profesionales para evitar errores de APIs externas
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
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error("Fallo en la autenticación", err);
      toast.error("Error al conectar con el servidor de identidad");
      setLoading(false);
    });
  }, []);

  const fetchData = async (userId) => {
    try {
      const resRecipes = await axios.get('/recipes');
      setRecipes(resRecipes.data);

      const resRecs = await axios.get(`/recommendations/${userId}`, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });
      setRecommendations(resRecs.data);
    } catch (err) {
      console.error("Error cargando datos:", err);
    }
  };

  const updatePreferences = async (newPref) => { 
    const loadId = toast.loading(`Actualizando a cocina ${newPref}...`);
    try {
      await axios.post('/users/preferences', 
        { userId: keycloak.tokenParsed.sub, category: newPref },
        { headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json' } }
      );
      toast.success(`¡Preferencias actualizadas! 👨‍🍳`, { id: loadId });
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1000);
    } catch (err) {
      toast.error("No se pudo guardar la preferencia", { id: loadId });
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="logo-text" style={{fontSize: '3rem', marginBottom: '1rem'}}>👨‍🍳 ChefMatch</div>
        <div className="spinner"></div>
        <p style={{marginTop: '20px', letterSpacing: '2px', opacity: 0.7}}>PREPARANDO INGREDIENTES...</p>
      </div>
    );
  }

  if (!authenticated) return <div className="loader-container">Redirigiendo...</div>;

  return (
    <div className="app-container">
      <Toaster position="top-right" toastOptions={{
        style: { background: '#1e293b', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      }} />

      <header className="main-header">
        <div className="logo-text">ChefMatch</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="user-badge">
            <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>CHEF EJECUTIVO</span>
            <span style={{ fontWeight: '800' }}>{username.toUpperCase()}</span>
          </div>
          <button onClick={() => keycloak.logout()} className="logout-btn">SALIR</button>
        </div>
      </header>

      <main style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', marginBottom: '3rem' }}>
          
          <section className="glass-panel" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <h3 style={{fontSize: '1.8rem', marginBottom: '0.5rem'}}>¿Qué te apetece hoy?</h3>
              <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Personaliza tu algoritmo de recomendaciones con un click.</p>
              <div className="category-grid">
                <button onClick={() => updatePreferences('Italiana')} className="btn-modern">Italiana 🍝</button>
                <button onClick={() => updatePreferences('Mexicana')} className="btn-modern">Mexicana 🌮</button>
                <button onClick={() => updatePreferences('Vegana')} className="btn-modern">Vegana 🥗</button>
                <button onClick={() => updatePreferences('Japonesa')} className="btn-modern">Japonesa 🍣</button>
              </div>
            </div>
          </section>

          <section className="glass-panel" style={{ borderTop: '4px solid #f97316' }}>
            <h3 style={{ color: '#f97316', fontSize: '1.3rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="pulse-dot"></span> Sugerencias IA
            </h3>
            <div>
              {recommendations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recommendations.map((rec, index) => (
                    <div key={index} className="recommendation-chip">✨ {rec}</div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', opacity: 0.5 }}>
                  <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🥣</div>
                  <p>Dinos qué categoría te gusta para empezar a sugerirte platos.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: '800' }}>Explorar Recetas</h2>
          <div className="status-tag">SISTEMA ONLINE</div>
        </div>

        <div className="recipe-grid">
          {recipes.map((recipe, index) => (
            <div key={recipe.id || index} className="glass-panel recipe-card">
              <div className="recipe-image-container">
                <img 
                  src={categoryImages[recipe.category.toLowerCase()] || categoryImages.default} 
                  alt={recipe.name}
                  className="recipe-img"
                  loading="lazy"
                />
                <span className="badge-floating">{recipe.category}</span>
              </div>
              <div style={{ padding: '1.2rem' }}>
                <h4 style={{ fontSize: '1.4rem', marginBottom: '0.8rem', color: '#fff' }}>{recipe.name}</h4>
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', lineHeight: '1.6' }}>{recipe.description}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;