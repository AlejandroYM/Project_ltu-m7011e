import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Keycloak from 'keycloak-js';

// Configuración de Keycloak (REQ20)
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
    // Inicializar Keycloak al cargar la web
    keycloak.init({ 
      onLoad: 'login-required', 
      checkLoginIframe: false,
      pkceMethod: 'S256',
      responseMode: 'query'
    }).then(auth => {
      setAuthenticated(auth);
      if (auth) {
        setUsername(keycloak.tokenParsed.preferred_username);
        // .finally() asegura que la pantalla gris se quite incluso si las APIs fallan
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
      // Usamos rutas con barra final y sin /api para que coincidan con el Ingress
      const resRecipes = await axios.get('/recipes');
      setRecipes(resRecipes.data);

      const resRecs = await axios.get(`/recommendations/${userId}/`);
      setRecommendations(resRecs.data.recommendations || []);
    } catch (err) {
      console.error("Error cargando datos de los microservicios", err);
    }
  };

  const updatePreferences = async (newPref) => {
    try {
      // Ruta actualizada para el user-service a través del Ingress
      await axios.post('/users/preferences', 
        { preferences: newPref },
        { headers: { Authorization: `Bearer ${keycloak.token}` } }
      );
      
      alert(`Enviado a RabbitMQ: Preferencia "${newPref}"`);
      
      // Refrescamos después de un breve delay
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1500);
    } catch (err) {
      console.error(err);
      alert("Error al comunicar con el user-service");
    }
  };

  if (loading) return <div style={{textAlign: 'center', marginTop: '50px'}}>Cargando sistema de seguridad...</div>;
  if (!authenticated) return <div style={{textAlign: 'center', marginTop: '50px'}}>No autenticado.</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '1200px', margin: '0 auto', color: '#333' }}>
      
      {/* HEADER */}
      <header style={{ borderBottom: '2px solid #eee', paddingBottom: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>👨‍🍳 Chef Match</h1>
        <div>
          <span>Hola, <strong>{username}</strong> </span>
          <button onClick={() => keycloak.logout()} style={{ marginLeft: '10px', padding: '5px 15px', cursor: 'pointer' }}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      <main>
        {/* SECCIÓN DE RECOMENDACIONES (REQ2) */}
        <section style={{ backgroundColor: '#f0f7ff', padding: '20px', borderRadius: '10px', marginBottom: '30px', border: '1px solid #d0e7ff' }}>
          <h3 style={{ marginTop: 0 }}>✨ Recomendaciones Personalizadas (REQ2)</h3>
          <p style={{ fontSize: '0.9rem', color: '#666' }}>Estas sugerencias se actualizan vía RabbitMQ cuando cambias tus gustos:</p>
          
          <ul style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
            {recommendations.length > 0 ? (
              recommendations.map((rec, i) => <li key={i} style={{ marginBottom: '5px' }}>{rec}</li>)
            ) : (
              <li>No hay recomendaciones aún. Prueba a actualizar tus gustos abajo.</li>
            )}
          </ul>

          <div style={{ marginTop: '15px' }}>
            <span style={{ marginRight: '10px' }}>Simular cambio de gustos:</span>
            <button onClick={() => updatePreferences('Comida Italiana')} style={btnStyle}>Italiana 🍝</button>
            <button onClick={() => updatePreferences('Comida Vegana')} style={btnStyle}>Vegana 🥗</button>
            <button onClick={() => updatePreferences('Comida Picante')} style={btnStyle}>Picante 🌶️</button>
          </div>
        </section>

        {/* SECCIÓN DE RECETAS (REQ14) */}
        <section>
          <h3>Explorar Catálogo de Recetas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
            {recipes.length > 0 ? (
              recipes.map(recipe => (
                <div key={recipe.id} style={cardStyle}>
                  <h4 style={{ margin: '0 0 10px 0' }}>{recipe.title}</h4>
                  <span style={tagStyle}>{recipe.category}</span>
                  <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '10px' }}>
                    <strong>Ingredientes:</strong> {recipe.ingredients ? recipe.ingredients.join(', ') : 'Varios'}
                  </p>
                </div>
              ))
            ) : (
              <p>No se encontraron recetas en el catálogo.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// Estilos
const btnStyle = {
  marginRight: '10px',
  padding: '8px 12px',
  backgroundColor: '#fff',
  border: '1px solid #007bff',
  color: '#007bff',
  borderRadius: '5px',
  cursor: 'pointer'
};

const cardStyle = {
  border: '1px solid #ddd',
  padding: '15px',
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  backgroundColor: '#fff'
};

const tagStyle = {
  backgroundColor: '#28a745',
  color: 'white',
  padding: '2px 8px',
  borderRadius: '10px',
  fontSize: '0.75rem',
  textTransform: 'uppercase'
};

export default App;