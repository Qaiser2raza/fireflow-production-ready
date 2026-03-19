import os from 'os';
import { logger } from '../../shared/lib/logger';

/**
 * NetworkDiscoveryService
 * 
 * Responsibilities:
 * - Gather network interface information
 * - Detect the most suitable LAN IP for mobile connections
 * - Prioritize Wi-Fi and common Pakistani home router subnets (192.168.x.x)
 */
export class NetworkDiscoveryService {
  private static bestIP: string | null = null;

  /**
   * Get all valid LAN IPv4 addresses
   */
  static getLocalIPs(): string[] {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;

      for (const iface of ifaceList) {
        // Skip IPv6, internal (loopback), and link-local (169.254.x.x)
        if (
          iface.family === 'IPv4' && 
          !iface.internal && 
          !iface.address.startsWith('169.254.')
        ) {
          addresses.push(iface.address);
        }
      }
    }

    return addresses;
  }

  /**
   * Identify the best local IP for QR codes and remote access
   * Prefers 192.168.x.x (common) and interfaces often used for Wi-Fi
   */
  static getBestLocalIP(): string {
    if (this.bestIP) return this.bestIP;

    const interfaces = os.networkInterfaces();
    const candidates: { ip: string; priority: number }[] = [];

    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;

      const lowerName = name.toLowerCase();
      const isWifi = lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('wireless');

      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
          let priority = 0;

          // Rule: Prefer 192.168.x.x subnets
          if (iface.address.startsWith('192.168.')) priority += 10;
          
          // Rule: Prefer 10.x.x.x subnets (moderate)
          if (iface.address.startsWith('10.')) priority += 5;

          // Rule: Significant boost for Wi-Fi adapters
          if (isWifi) priority += 20;

          candidates.push({ ip: iface.address, priority });
        }
      }
    }

    // Sort by priority descending
    candidates.sort((a, b) => b.priority - a.priority);

    const best = candidates.length > 0 ? candidates[0].ip : '127.0.0.1';
    
    // Cache in process.env as requested
    process.env.LOCAL_API_IP = best;
    this.bestIP = best;

    logger.log({
      level: 'INFO' as any,
      service: 'network',
      action: 'best_ip_detected',
      metadata: { ip: best, all_candidates: candidates }
    });

    return best;
  }

  /**
   * Get the full base URL for this server
   */
  static getServerURL(): string {
    const ip = this.getBestLocalIP();
    const port = process.env.PORT || 3001;
    return `http://${ip}:${port}`;
  }
}
