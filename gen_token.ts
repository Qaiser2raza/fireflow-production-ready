
import { jwtService } from './src/api/services/auth/JwtService';
import dotenv from 'dotenv';
dotenv.config();

const payload = {
  staffId: '5813339f-0042-4391-920d-111973dac5ac',
  restaurantId: 'b1972d7d-8374-4b55-9580-95a15f18f656',
  role: 'ADMIN',
  name: 'Test Admin'
};

const token = jwtService.generateAccessToken(
  payload.staffId,
  payload.restaurantId,
  payload.role,
  payload.name
);

console.log('TOKEN:', token);
