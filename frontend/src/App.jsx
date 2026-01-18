import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Keycloak from 'keycloak-js';
import './App.css'; // Asegúrate de que el CSS sea el nuevo que te pasé

// Configuración de Keycloak
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

  useEffect(() => {
    // Inicializar Keycloak
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
      setLoading(false);
    });
  }, []);

  const fetchData = async (userId) => {
    try {
      // 1. Obtener Recetas
      const resRecipes = await axios.get('/recipes');
      setRecipes(resRecipes.data);

      // 2. Obtener Recomendaciones
      const resRecs = await axios.get(`/recommendations/${userId}`, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });
      setRecommendations(resRecs.data);
    } catch (err) {
      console.error("Error cargando datos:", err);
    }
  };

  const updatePreferences = async (newPref) => { 
    try {
      await axios.post('/users/preferences', 
        { 
          userId: keycloak.tokenParsed.sub,
          category: newPref 
        },
        { 
          headers: { 
            Authorization: `Bearer ${keycloak.token}`,
            'Content-Type': 'application/json'
          } 
        }
      );
      alert(`¡Preferencia "${newPref}" guardada! Actualizando tus recomendaciones...`);
      // Refrescamos datos tras un segundo para dar tiempo al bus de eventos
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1000);
    } catch (err) {
      console.error("Error al comunicar con user-service", err);
      alert("Error al actualizar preferencias.");
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <h2 className="logo-text" style={{fontSize: '2rem'}}>👨‍🍳 ChefMatch</h2>
        <p style={{marginTop: '10px'}}>Cargando tu cocina digital...</p>
      </div>
    );
  }

  if (!authenticated) return <div className="loader-container">Redirigiendo al login...</div>;

  return (
    <div className="app-container">
      {/* HEADER SUPERIOR */}
      <header className="main-header">
        <div className="logo-text">👨‍🍳 ChefMatch</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span>Bienvenido, <strong style={{color: '#f97316'}}>{username}</strong></span>
          <button onClick={() => keycloak.logout()} className="logout-btn">
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ padding: '2rem 3rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '3rem' }}>
          
          {/* BLOQUE DE PREFERENCIAS */}
          <section className="glass-panel">
            <h3 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>¿Qué cocinamos hoy?</h3>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Selecciona una categoría para personalizar tu experiencia.</p>
            <div className="category-grid">
              <button onClick={() => updatePreferences('Italiana')} className="btn-modern">Italiana 🍝</button>
              <button onClick={() => updatePreferences('Mexicana')} className="btn-modern">Mexicana 🌮</button>
              <button onClick={() => updatePreferences('Vegana')} className="btn-modern">Vegana 🥗</button>
              <button onClick={() => updatePreferences('Japonesa')} className="btn-modern">Japonesa 🍣</button>
            </div>
          </section>

          {/* BLOQUE DE RECOMENDACIONES */}
          <section className="glass-panel" style={{ borderLeft: '4px solid #f97316' }}>
            <h3 style={{ color: '#f97316', fontSize: '1.5rem', marginBottom: '1rem' }}>✨ Recomendaciones</h3>
            <div style={{ marginTop: '0.5rem' }}>
              {recommendations.length > 0 ? (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {recommendations.map((rec, index) => (
                    <div key={index} style={{ 
                      background: 'rgba(249, 115, 22, 0.1)', 
                      padding: '12px 20px', 
                      borderRadius: '12px',
                      border: '1px solid rgba(249, 115, 22, 0.2)',
                      fontWeight: '500'
                    }}>
                      {rec}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#64748b', fontStyle: 'italic' }}>
                  Elige una categoría a la izquierda para ver qué te recomendamos.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* CATÁLOGO GLOBAL */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.8rem' }}>📖 Catálogo de Recetas</h2>
          <span style={{ color: '#64748b' }}>{recipes.length} recetas disponibles</span>
        </div>

        <div className="recipe-grid">
          {recipes.map(recipe => (
            <div key={recipe.id} className="glass-panel recipe-card">
              <span className="badge">{recipe.category}</span>
              <h4 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1.3rem', color: '#f8fafc' }}>{recipe.name}</h4>
              <p style={{ fontSize: '0.95rem', color: '#94a3b8', lineHeight: '1.6' }}>
                {recipe.description}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;