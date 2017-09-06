'use strict';

let Service;
let Characteristic;

class PlugAccessory {
  constructor (platform, config, accessory, client, plug) {
    this.platform = platform;
    Service = platform.homebridge.hap.Service;
    Characteristic = platform.homebridge.hap.Characteristic;

    this.log = platform.log;

    this.accessory = accessory;
    this.client = client;
    this.config = config;

    this.debug = !!(this.config.debug);

    this.deviceId = accessory.context.deviceId;

    this.plug = plug;
    this._plug.on('power-on', (plug) => { this.setOn(true); });
    this._plug.on('power-off', (plug) => { this.setOn(false); });
    this._plug.on('in-use', (plug) => { this.setOutletInUse(true); });
    this._plug.on('not-in-use', (plug) => { this.setOutletInUse(false); });
  }

  get plug () { return this._plug; }

  set plug (plug) {
    this._plug = plug;
  }

  identify (callback) {
    // TODO
    callback();
  }

  setOn (value) {
    this.log.debug('%s setOn(%s)', this.accessory.accessory.displayName, value);
    const outletService = this.accessory.getService(Service.Outlet);
    const characteristic = outletService.getCharacteristic(Characteristic.On);
    characteristic.setValue(value);
  }

  setOutletInUse (value) {
    this.log.debug('setOutletInUse(%s)', value);
    const outletService = this.accessory.getService(Service.Outlet);
    const characteristic = outletService.getCharacteristic(Characteristic.OutletInUse);
    characteristic.setValue(value);
  }

  configure (plug) {
    this.log.info('Configuring: %s', this.accessory.displayName);

    let plugInfo = plug ? Promise.resolve(plug.getInfo) : this.plug.getInfo();

    return plugInfo.then((info) => {
      const pa = this.accessory;

      this.refresh(info.sysInfo);

      const outletService = pa.getService(Service.Outlet);
      outletService.getCharacteristic(Characteristic.On)
        .on('get', (callback) => {
          this.plug.getSysInfo().then((si) => {
            this.refresh(si);
            callback(null, si.relay_state === 1);
          }).catch((reason) => {
            this.log.error(reason);
          });
        })
        .on('set', (value, callback) => {
          this.plug.setPowerState(value).then(() => {
            callback();
          }, (reason) => {
            this.log.error(reason);
          });
        });

      outletService.getCharacteristic(Characteristic.OutletInUse)
        .on('get', (callback) => {
          this.plug.getSysInfo().then((si) => {
            this.refresh(si);
            if (plug.supportsConsumption) {
              this.plug.getConsumption().then((consumption) => {
                callback(null, consumption.power > 0);
              });
            } else {
              // On plugs that don't support consumption we use relay state
              callback(null, si.relay_state === 1);
            }
          }).catch((reason) => {
            this.log.error(reason);
          });
        });
    }).catch((reason) => {
      this.log.error(reason);
    });
  }

  refresh (sysInfo) {
    sysInfo = sysInfo ? Promise.resolve(sysInfo) : this.plug.getSysInfo();

    return sysInfo.then((si) => {
      const name = si.alias;
      this.accessory.displayName = name;

      const outletService = this.accessory.getService(Service.Outlet);
      outletService.setCharacteristic(Characteristic.Name, name);

      const infoService = this.accessory.getService(Service.AccessoryInformation);
      infoService
        .setCharacteristic(Characteristic.Name, name)
        .setCharacteristic(Characteristic.Manufacturer, 'TP-Link')
        .setCharacteristic(Characteristic.Model, si.model)
        .setCharacteristic(Characteristic.SerialNumber, si.deviceId)
        .setCharacteristic(Characteristic.FirmwareRevision, si.sw_ver)
        .setCharacteristic(Characteristic.HardwareRevision, si.hw_ver);

      this.accessory.context.lastRefreshed = new Date();
      return this;
    }).catch((reason) => {
      this.log.error(reason);
    });
  }
}

module.exports = PlugAccessory;