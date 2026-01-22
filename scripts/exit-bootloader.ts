/**
 * Utilitaire pour sortir un Sonoff Dongle Plus du mode bootloader
 * Utilisez ce script si votre dongle est bloqué en mode bootloader Gecko
 */

import { SerialPort } from 'serialport';

const PORT = 'COM5';
const BAUDRATE = 115200;

async function exitBootloader() {
  console.log(`🔧 Tentative de sortie du bootloader Gecko sur ${PORT}...`);
  
  const port = new SerialPort({
    path: PORT,
    baudRate: BAUDRATE,
    autoOpen: false,
  });

  return new Promise((resolve, reject) => {
    port.open((err) => {
      if (err) {
        console.error('❌ Impossible d\'ouvrir le port:', err.message);
        reject(err);
        return;
      }

      console.log('✅ Port ouvert');

      port.on('data', (data) => {
        const text = data.toString();
        console.log('📥 Reçu:', text.trim());
        
        if (text.includes('Gecko Bootloader')) {
          console.log('🔍 Bootloader Gecko détecté');
          console.log('📤 Envoi de la commande "2" (run)...');
          
          // Envoyer la commande "2" pour exécuter le firmware
          port.write('2\n', (writeErr) => {
            if (writeErr) {
              console.error('❌ Erreur d\'écriture:', writeErr.message);
              reject(writeErr);
            } else {
              console.log('✅ Commande envoyée');
              setTimeout(() => {
                port.close();
                console.log('✅ Port fermé - Le dongle devrait maintenant démarrer');
                console.log('🔄 Vous pouvez maintenant lancer votre application');
                resolve(true);
              }, 2000);
            }
          });
        }
      });

      // Timeout si rien ne se passe
      setTimeout(() => {
        if (port.isOpen) {
          port.close();
          console.log('⏱️  Timeout - Le dongle ne semble pas être en mode bootloader');
          resolve(false);
        }
      }, 5000);
    });
  });
}

exitBootloader()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
