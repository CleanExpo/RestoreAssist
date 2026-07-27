import Foundation
import Capacitor
#if canImport(RoomPlan)
import RoomPlan
#endif

/**
 RA-7091 Phase 1 — Capacitor RoomPlan support probe.

 Fail-closed: returns `{ supported: false }` on iOS < 16, simulators / non-LiDAR
 devices, or when the RoomPlan framework is unavailable. Capture session APIs
 land in Phase 2 — this plugin only answers "can this device open RoomPlan?".
 */
@objc(RoomPlanPlugin)
public class RoomPlanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RoomPlanPlugin"
    public let jsName = "RoomPlan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise)
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        #if canImport(RoomPlan)
        if #available(iOS 16.0, *) {
            call.resolve(["supported": RoomCaptureSession.isSupported])
            return
        }
        #endif
        call.resolve(["supported": false])
    }
}
