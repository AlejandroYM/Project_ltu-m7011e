const request = require('supertest');
// Corregimos la ruta: ../server para subir un nivel desde /tests
const app = require('../server'); 

// 1. SIMULAMOS RABBITMQ (Para que el test no dependa del servidor real)
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn().mockResolvedValue(true),
      sendToQueue: jest.fn().mockReturnValue(true)
    })
  })
}));

// Opcional: Silenciamos los console.log durante el test para ver el reporte limpio
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('User Service - REQ5 & REQ7 Tests', () => {
  
  // REQ14: Test de éxito - Ruta real /users/health
  it('GET /users/health debe responder 200 OK', async () => {
    const res = await request(app).get('/users/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toBe('UP');
  });

  // REQ7 & REQ20: Test de fallo 1 - Acceso no autorizado
  it('POST /users/preferences debe dar 403 sin token de Keycloak', async () => {
    const res = await request(app)
      .post('/users/preferences')
      .send({ category: 'Italiana' });
    
    // Keycloak debe devolver 403 (Forbidden) o 401 (Unauthorized)
    expect([401, 403]).toContain(res.statusCode);
  });

  // REQ7: Test de fallo 2 - Ruta inexistente
  it('Cualquier ruta inválida debe devolver 404', async () => {
    const res = await request(app).get('/users/ruta-que-no-existe');
    expect(res.statusCode).toBe(404);
  });
  // Añade esto al final de use.test.js
afterAll(async () => {
  // Cerramos cualquier conexión pendiente si fuera necesario
  // Por ahora, forzamos que el proceso de Jest termine
  await new Promise(resolve => setTimeout(() => resolve(), 500)); 
});
});