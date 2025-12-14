export default function handler(req, res) {
  console.log('Login endpoint hit');
  res.status(200).json({ message: 'Login endpoint working' });
}
