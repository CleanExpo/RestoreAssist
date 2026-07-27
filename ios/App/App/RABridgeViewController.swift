import UIKit
import Capacitor

/**
 Subclass of Capacitor's bridge VC so local custom plugins (RoomPlan) can
 register. Storyboard points Main → this class instead of CAPBridgeViewController.
 */
class RABridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RoomPlanPlugin())
    }
}
